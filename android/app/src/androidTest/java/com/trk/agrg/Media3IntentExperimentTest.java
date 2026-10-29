// SPDX-License-Identifier: GPL-3.0-or-later
package com.trk.agrg;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import android.os.Looper;
import androidx.media3.common.Player;
import androidx.media3.common.SimpleBasePlayer;
import androidx.media3.common.util.UnstableApi;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import com.google.common.util.concurrent.Futures;
import com.google.common.util.concurrent.ListenableFuture;
import java.util.Collections;
import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Intent-only experiment. There is no real WebView, audio, bridge, session, clock, or service. */
@RunWith(AndroidJUnit4.class)
@UnstableApi
public class Media3IntentExperimentTest {
    private static final class IntentPlayer extends SimpleBasePlayer {
        static final class Operation {
            final long generation;
            final boolean requestedPlay;
            Operation(long generation, boolean requestedPlay) {
                this.generation = generation;
                this.requestedPlay = requestedPlay;
            }
        }
        long generation;
        int issued;
        boolean blocked;
        boolean desiredPlay;
        boolean awaitingResult;
        // An independent fake remote flag. It models neither audio nor Android output.
        boolean fakeRemotePlaying;
        Operation pending;

        IntentPlayer(boolean initialPlaying) {
            super(Looper.getMainLooper());
            desiredPlay = initialPlaying;
            fakeRemotePlaying = initialPlaying;
        }
        @Override protected State getState() {
            Player.Commands.Builder commands = new Player.Commands.Builder();
            if (!blocked) commands.add(Player.COMMAND_PLAY_PAUSE);
            return new State.Builder()
                .setAvailableCommands(commands.build())
                .setPlaylist(Collections.singletonList(new MediaItemData.Builder("fixture").build()))
                // This mapping is intentionally under examination, not a proposed production contract.
                .setPlaybackState(blocked ? Player.STATE_IDLE : awaitingResult ? Player.STATE_BUFFERING : Player.STATE_READY)
                .setPlayWhenReady(!blocked && desiredPlay, Player.PLAY_WHEN_READY_CHANGE_REASON_USER_REQUEST)
                .build();
        }
        @Override protected ListenableFuture<?> handleSetPlayWhenReady(boolean value) {
            if (!blocked) {
                // The synchronous change is user intent only. No remote command has completed.
                desiredPlay = value;
                awaitingResult = true;
                pending = new Operation(++generation, value);
                issued++;
            }
            return Futures.immediateVoidFuture();
        }
        boolean reply(Operation operation, boolean succeeded) {
            if (blocked || operation == null || operation != pending || operation.generation != generation) return false;
            pending = null;
            awaitingResult = false;
            if (succeeded) {
                fakeRemotePlaying = operation.requestedPlay;
            } else {
                generation++;
                blocked = true;
                desiredPlay = false;
                // A failed response proves nothing about the independent fake remote flag.
            }
            invalidateState();
            return true;
        }
        void timeoutOrInterrupt() {
            generation++;
            blocked = true;
            desiredPlay = false;
            awaitingResult = false;
            pending = null;
            // Deliberately do not modify fakeRemotePlaying: no remote stop is implied.
            invalidateState();
        }
        void explicitResumeForTest() {
            blocked = false;
            invalidateState();
        }
    }

    @Test
    public void intentUpdateIsImmediateButPauseCanMisrepresentRemotePlayback() {
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
            IntentPlayer player = new IntentPlayer(false);
            player.play();
            IntentPlayer.Operation play = player.pending;
            assertTrue(player.getPlayWhenReady());
            assertEquals(Player.STATE_BUFFERING, player.getPlaybackState());
            assertFalse(player.isPlaying());
            assertFalse(player.fakeRemotePlaying);
            assertTrue(player.reply(play, true));
            assertEquals(Player.STATE_READY, player.getPlaybackState());
            assertTrue(player.isPlaying());
            assertTrue(player.fakeRemotePlaying);

            player.pause();
            IntentPlayer.Operation pause = player.pending;
            assertFalse(player.getPlayWhenReady());
            assertEquals(Player.STATE_BUFFERING, player.getPlaybackState());
            assertFalse("Intent-based isPlaying is already false", player.isPlaying());
            assertTrue("But the simulated remote is still playing before acknowledgement", player.fakeRemotePlaying);
            assertTrue(player.reply(pause, false));
            assertEquals(Player.STATE_IDLE, player.getPlaybackState());
            assertFalse(player.isPlaying());
            assertTrue("A failed pause still does not prove remote silence", player.fakeRemotePlaying);
        });
    }

    @Test
    public void intentTimeoutAndStaleReplyDoNotProveSilenceOrCompleteNewCommand() {
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
            IntentPlayer player = new IntentPlayer(false);
            player.play();
            IntentPlayer.Operation old = player.pending;
            // Model a remote start whose response is delayed; there is no actual playback.
            player.fakeRemotePlaying = true;
            player.timeoutOrInterrupt();
            assertEquals(Player.STATE_IDLE, player.getPlaybackState());
            assertFalse(player.isPlaying());
            assertTrue(player.fakeRemotePlaying);
            assertFalse(player.isCommandAvailable(Player.COMMAND_PLAY_PAUSE));
            player.play();
            assertEquals(1, player.issued);

            player.explicitResumeForTest();
            player.play();
            IntentPlayer.Operation current = player.pending;
            assertFalse(player.reply(old, true));
            assertTrue(current == player.pending);
            assertEquals(Player.STATE_BUFFERING, player.getPlaybackState());
            assertFalse(player.isPlaying());
            assertTrue(player.reply(current, true));
            assertTrue(player.isPlaying());
            assertFalse("Duplicate acknowledgement is ignored", player.reply(current, true));
        });
    }

    @Test
    public void intentListenerCanInterruptSynchronouslyWithoutPendingPlayerFuture() {
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
            IntentPlayer player = new IntentPlayer(false);
            AtomicBoolean listenerRan = new AtomicBoolean();
            player.addListener(new Player.Listener() {
                @Override public void onPlayWhenReadyChanged(boolean playWhenReady, int reason) {
                    if (playWhenReady && !listenerRan.getAndSet(true)) {
                        player.timeoutOrInterrupt();
                        player.play();
                    }
                }
            });
            player.play();
            assertTrue(listenerRan.get());
            assertEquals(1, player.issued);
            assertTrue(player.blocked);
            assertTrue(player.pending == null);
            assertFalse(player.getPlayWhenReady());
            assertFalse(player.isPlaying());
            assertEquals(Player.STATE_IDLE, player.getPlaybackState());
            assertFalse(player.isCommandAvailable(Player.COMMAND_PLAY_PAUSE));
        });
    }
}
