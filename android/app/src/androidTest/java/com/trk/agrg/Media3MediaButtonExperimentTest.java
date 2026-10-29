// SPDX-License-Identifier: GPL-3.0-or-later
package com.trk.agrg;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.content.Context;
import android.os.Looper;
import android.view.KeyEvent;
import androidx.media3.common.C;
import androidx.media3.common.Player;
import androidx.media3.common.SimpleBasePlayer;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.session.MediaSession;
import androidx.test.core.app.ApplicationProvider;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import com.google.common.util.concurrent.Futures;
import com.google.common.util.concurrent.ListenableFuture;
import java.util.Arrays;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Synthetic platform media keys to a disposable session; no hardware, audio, service or WebView. */
@RunWith(AndroidJUnit4.class)
@UnstableApi
public class Media3MediaButtonExperimentTest {
    private static final class Event {
        final int command;
        final int index;
        final long positionMs;
        final Boolean play;
        Event(int command, int index, long positionMs, Boolean play) {
            this.command = command;
            this.index = index;
            this.positionMs = positionMs;
            this.play = play;
        }
    }

    private static final class NavigationPlayer extends SimpleBasePlayer {
        final BlockingQueue<Event> events = new LinkedBlockingQueue<>();
        final boolean enablePreviousGeneral;
        int index = 1;
        long positionMs = 10_000;
        boolean playing;
        NavigationPlayer(boolean enablePreviousGeneral) {
            super(Looper.getMainLooper());
            this.enablePreviousGeneral = enablePreviousGeneral;
        }
        @Override protected State getState() {
            Player.Commands.Builder commands = new Player.Commands.Builder()
                .add(Player.COMMAND_PLAY_PAUSE)
                .add(Player.COMMAND_SEEK_TO_NEXT)
                .add(Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM)
                .add(Player.COMMAND_GET_CURRENT_MEDIA_ITEM)
                .add(Player.COMMAND_GET_TIMELINE)
                .add(Player.COMMAND_GET_METADATA)
                .add(Player.COMMAND_RELEASE);
            if (enablePreviousGeneral) commands.add(Player.COMMAND_SEEK_TO_PREVIOUS);
            return new State.Builder()
                .setAvailableCommands(commands.build())
                .setPlaylist(Arrays.asList(
                    new MediaItemData.Builder("a").setIsSeekable(true).setDurationUs(120_000_000L).build(),
                    new MediaItemData.Builder("b").setIsSeekable(true).setDurationUs(120_000_000L).build(),
                    new MediaItemData.Builder("c").setIsSeekable(true).setDurationUs(120_000_000L).build()))
                .setCurrentMediaItemIndex(index)
                .setContentPositionMs(positionMs)
                .setMaxSeekToPreviousPositionMs(3_000)
                .setPlaybackState(Player.STATE_READY)
                .setPlayWhenReady(playing, Player.PLAY_WHEN_READY_CHANGE_REASON_USER_REQUEST)
                .build();
        }
        @Override protected ListenableFuture<?> handleSetPlayWhenReady(boolean value) {
            playing = value;
            events.add(new Event(Player.COMMAND_PLAY_PAUSE, index, positionMs, value));
            return Futures.immediateVoidFuture();
        }
        @Override protected ListenableFuture<?> handleSeek(int itemIndex, long newPositionMs, int command) {
            events.add(new Event(command, itemIndex, newPositionMs, null));
            if (itemIndex != C.INDEX_UNSET) {
                index = itemIndex;
                positionMs = newPositionMs == C.TIME_UNSET ? 0 : newPositionMs;
            }
            return Futures.immediateVoidFuture();
        }
        @Override protected ListenableFuture<?> handleRelease() { return Futures.immediateVoidFuture(); }
    }

    private static void sendKey(android.media.session.MediaController controller, int code) {
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
            controller.dispatchMediaButtonEvent(new KeyEvent(KeyEvent.ACTION_DOWN, code));
            controller.dispatchMediaButtonEvent(new KeyEvent(KeyEvent.ACTION_UP, code));
        });
    }

    private static Event nextEvent(NavigationPlayer player) throws InterruptedException {
        Event event = player.events.poll(20, TimeUnit.SECONDS);
        assertNotNull("Expected the synthetic media key to reach the fake player", event);
        return event;
    }

    private static void exercisePreviousKey(boolean enablePreviousGeneral) throws Exception {
        Context context = ApplicationProvider.getApplicationContext();
        AtomicReference<NavigationPlayer> playerRef = new AtomicReference<>();
        AtomicReference<MediaSession> sessionRef = new AtomicReference<>();
        AtomicReference<android.media.session.MediaController> controllerRef = new AtomicReference<>();
        try {
            InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
                NavigationPlayer player = new NavigationPlayer(enablePreviousGeneral);
                playerRef.set(player);
                MediaSession session = new MediaSession.Builder(context, player)
                    .setId(enablePreviousGeneral ? "trk-media-key-general" : "trk-media-key-item-only")
                    .build();
                sessionRef.set(session);
                controllerRef.set(new android.media.session.MediaController(context, session.getPlatformToken()));
            });
            NavigationPlayer player = playerRef.get();
            android.media.session.MediaController controller = controllerRef.get();
            sendKey(controller, KeyEvent.KEYCODE_MEDIA_PREVIOUS);
            Event previous = nextEvent(player);
            if (enablePreviousGeneral) {
                // The normal Media3 command restarts the current item after the threshold.
                assertEquals(Player.COMMAND_SEEK_TO_PREVIOUS, previous.command);
                assertEquals(1, previous.index);
                assertEquals(0, previous.positionMs);
                sendKey(controller, KeyEvent.KEYCODE_MEDIA_PREVIOUS);
                Event previousAgain = nextEvent(player);
                assertEquals(Player.COMMAND_SEEK_TO_PREVIOUS, previousAgain.command);
                assertEquals(0, previousAgain.index);
            } else {
                // Legacy session fallback when only previous-media-item is available.
                assertEquals(Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM, previous.command);
                assertEquals(0, previous.index);
            }
            sendKey(controller, KeyEvent.KEYCODE_MEDIA_NEXT);
            Event next = nextEvent(player);
            assertEquals(Player.COMMAND_SEEK_TO_NEXT, next.command);
            assertEquals(1, next.index);
            sendKey(controller, KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE);
            Event play = nextEvent(player);
            assertEquals(Player.COMMAND_PLAY_PAUSE, play.command);
            assertTrue(play.play);
        } finally {
            InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
                if (sessionRef.get() != null) sessionRef.get().release();
                if (playerRef.get() != null) playerRef.get().release();
            });
        }
    }

    @Test
    public void mediaKeysUseGeneralPreviousRestartSemantics() throws Exception {
        exercisePreviousKey(true);
    }

    @Test
    public void mediaKeysCanFallBackToPreviousItemCommand() throws Exception {
        exercisePreviousKey(false);
    }
}
