// SPDX-License-Identifier: GPL-3.0-or-later
package com.trk.agrg;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.content.Context;
import android.media.session.PlaybackState;
import android.os.Handler;
import android.os.Looper;
import androidx.media3.common.Player;
import androidx.media3.common.SimpleBasePlayer;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.session.MediaController;
import androidx.media3.session.MediaSession;
import androidx.test.core.app.ApplicationProvider;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import com.google.common.util.concurrent.Futures;
import com.google.common.util.concurrent.ListenableFuture;
import java.util.Collections;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Disposable in-process session/controller test; no real playback, service or notification. */
@RunWith(AndroidJUnit4.class)
@UnstableApi
public class Media3SessionExperimentTest {
    private static final class FakePlayer extends SimpleBasePlayer {
        final CountDownLatch pauseReceived = new CountDownLatch(1);
        boolean fakeRemotePlaying = true;
        boolean desiredPlay = true;
        boolean waiting;
        boolean blocked;
        int issued;

        FakePlayer() { super(Looper.getMainLooper()); }
        @Override protected State getState() {
            Player.Commands.Builder commands = new Player.Commands.Builder()
                .add(Player.COMMAND_GET_CURRENT_MEDIA_ITEM)
                .add(Player.COMMAND_GET_TIMELINE)
                .add(Player.COMMAND_GET_METADATA)
                .add(Player.COMMAND_RELEASE);
            if (!blocked) commands.add(Player.COMMAND_PLAY_PAUSE);
            return new State.Builder()
                .setAvailableCommands(commands.build())
                .setPlaylist(Collections.singletonList(new MediaItemData.Builder("fixture").build()))
                // Deliberately tentative: not a validated production mapping.
                .setPlaybackState(blocked ? Player.STATE_IDLE : waiting ? Player.STATE_BUFFERING : Player.STATE_READY)
                .setPlayWhenReady(!blocked && desiredPlay, Player.PLAY_WHEN_READY_CHANGE_REASON_USER_REQUEST)
                .build();
        }
        @Override protected ListenableFuture<?> handleSetPlayWhenReady(boolean value) {
            if (!blocked) {
                desiredPlay = value;
                waiting = true;
                issued++;
                if (!value) pauseReceived.countDown();
            }
            return Futures.immediateVoidFuture();
        }
        @Override protected ListenableFuture<?> handleRelease() { return Futures.immediateVoidFuture(); }
        void interrupt() {
            blocked = true;
            desiredPlay = false;
            waiting = false;
            // Unavailable is a projection, not a remote-stop acknowledgement.
            invalidateState();
        }
    }

    @Test
    public void sessionAndPlatformControllerCanReportPauseBeforeFakeRemoteStops() throws Exception {
        Context context = ApplicationProvider.getApplicationContext();
        AtomicReference<FakePlayer> playerRef = new AtomicReference<>();
        AtomicReference<MediaSession> sessionRef = new AtomicReference<>();
        AtomicReference<ListenableFuture<MediaController>> futureRef = new AtomicReference<>();
        AtomicReference<android.media.session.MediaController> platformRef = new AtomicReference<>();
        CountDownLatch controllerBuffered = new CountDownLatch(1);
        CountDownLatch controllerBlocked = new CountDownLatch(1);
        CountDownLatch platformPaused = new CountDownLatch(1);
        android.media.session.MediaController.Callback platformCallback = new android.media.session.MediaController.Callback() {
            @Override public void onPlaybackStateChanged(PlaybackState state) {
                if (state != null && state.getState() == PlaybackState.STATE_PAUSED) platformPaused.countDown();
            }
        };
        try {
            InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
                FakePlayer player = new FakePlayer();
                playerRef.set(player);
                MediaSession session = new MediaSession.Builder(context, player)
                    .setId("trk-test-session")
                    .build();
                sessionRef.set(session);
                android.media.session.MediaController platform =
                    new android.media.session.MediaController(context, session.getPlatformToken());
                platformRef.set(platform);
                platform.registerCallback(platformCallback, new Handler(Looper.getMainLooper()));
                futureRef.set(new MediaController.Builder(context, session.getToken())
                    .setApplicationLooper(Looper.getMainLooper()).buildAsync());
            });
            ListenableFuture<MediaController> future = futureRef.get();
            assertNotNull(future);
            // Wait from the instrumentation thread, never from the player's main looper.
            MediaController controller = future.get(20, TimeUnit.SECONDS);
            InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
                assertTrue(controller.isConnected());
                assertTrue(controller.isCommandAvailable(Player.COMMAND_PLAY_PAUSE));
                assertTrue(controller.isPlaying());
                controller.addListener(new Player.Listener() {
                    @Override public void onEvents(Player player, Player.Events events) {
                        if (player.getPlaybackState() == Player.STATE_BUFFERING && !player.getPlayWhenReady()) {
                            controllerBuffered.countDown();
                        }
                        if (player.getPlaybackState() == Player.STATE_IDLE
                                && !player.isCommandAvailable(Player.COMMAND_PLAY_PAUSE)) {
                            controllerBlocked.countDown();
                        }
                    }
                });
                controller.pause();
            });
            assertTrue("Pause must reach the fake player", playerRef.get().pauseReceived.await(20, TimeUnit.SECONDS));
            assertTrue("Media3 controller must observe the waiting state", controllerBuffered.await(20, TimeUnit.SECONDS));
            assertTrue("Platform controller must observe paused", platformPaused.await(20, TimeUnit.SECONDS));
            InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
                FakePlayer player = playerRef.get();
                assertEquals(1, player.issued);
                assertTrue("No remote stop has been acknowledged", player.fakeRemotePlaying);
                assertFalse(controller.isPlaying());
                assertFalse(controller.getPlayWhenReady());
                assertEquals(Player.STATE_BUFFERING, controller.getPlaybackState());
                assertEquals(PlaybackState.STATE_PAUSED, platformRef.get().getPlaybackState().getState());
                player.interrupt();
            });
            assertTrue("Controller must observe the blocked projection", controllerBlocked.await(20, TimeUnit.SECONDS));
            InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
                assertFalse(controller.isPlaying());
                assertFalse(controller.isCommandAvailable(Player.COMMAND_PLAY_PAUSE));
                assertEquals(1, playerRef.get().issued);
                assertTrue("Still no remote-stop acknowledgement", playerRef.get().fakeRemotePlaying);
            });
        } finally {
            InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
                if (platformRef.get() != null) platformRef.get().unregisterCallback(platformCallback);
                if (futureRef.get() != null) MediaController.releaseFuture(futureRef.get());
                if (sessionRef.get() != null) sessionRef.get().release();
                if (playerRef.get() != null) playerRef.get().release();
            });
        }
    }
}
