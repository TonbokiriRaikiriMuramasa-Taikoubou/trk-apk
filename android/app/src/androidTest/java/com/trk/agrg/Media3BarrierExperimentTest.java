// SPDX-License-Identifier: GPL-3.0-or-later
package com.trk.agrg;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotSame;
import static org.junit.Assert.assertSame;
import static org.junit.Assert.assertTrue;

import android.os.Looper;
import androidx.media3.common.Player;
import androidx.media3.common.SimpleBasePlayer;
import androidx.media3.common.util.UnstableApi;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import com.google.common.util.concurrent.Futures;
import com.google.common.util.concurrent.ListenableFuture;
import com.google.common.util.concurrent.MoreExecutors;
import com.google.common.util.concurrent.SettableFuture;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Test-only exploration; no audio, bridge, MediaSession or service exists here. */
@RunWith(AndroidJUnit4.class)
@UnstableApi
public class Media3BarrierExperimentTest {
    private static final class BarrierPlayer extends SimpleBasePlayer {
        static final class Operation {
            final long epoch;
            final long generation;
            final SettableFuture<Void> barrier;
            Operation(long epoch, long generation, SettableFuture<Void> barrier) {
                this.epoch = epoch;
                this.generation = generation;
                this.barrier = barrier;
            }
        }
        final List<Operation> pending = new ArrayList<>();
        private SettableFuture<Void> barrier;
        long epoch = 1;
        long generation;
        long revision = -1;
        boolean blocked;
        boolean interrupting;
        boolean projectedPlaying;
        int issued;
        int blockedAttempts;
        // Adversarial fixture only: register a callback BEFORE Media3 can register its listener.
        Runnable earlyCompletionListener;

        BarrierPlayer(boolean initialPlaying) {
            super(Looper.getMainLooper());
            projectedPlaying = initialPlaying;
        }
        @Override protected State getState() {
            Player.Commands.Builder commands = new Player.Commands.Builder();
            if (!blocked) commands.add(Player.COMMAND_PLAY_PAUSE);
            return new State.Builder()
                .setAvailableCommands(commands.build())
                .setPlaylist(Collections.singletonList(new MediaItemData.Builder("fixture").build()))
                .setPlaybackState(blocked ? Player.STATE_IDLE : Player.STATE_READY)
                .setPlayWhenReady(!blocked && projectedPlaying, Player.PLAY_WHEN_READY_CHANGE_REASON_USER_REQUEST)
                .build();
        }
        @Override protected State getPlaceholderState(State suggested) { return getState(); }
        @Override protected ListenableFuture<?> handleSetPlayWhenReady(boolean value) {
            if (blocked || interrupting) {
                blockedAttempts++;
                return Futures.immediateVoidFuture();
            }
            if (barrier == null) {
                barrier = SettableFuture.create();
                if (earlyCompletionListener != null) {
                    barrier.addListener(earlyCompletionListener, MoreExecutors.directExecutor());
                }
            }
            Operation operation = new Operation(epoch, generation, barrier);
            pending.add(operation);
            issued++;
            // Only this test adapter and SimpleBasePlayer own this barrier; individual
            // remote results are independent from the future exposed to the player.
            return barrier;
        }
        boolean reply(Operation operation, long replyEpoch, long replyGeneration, long replyRevision, boolean playing) {
            if (blocked || interrupting || !pending.contains(operation) || operation.barrier != barrier
                    || replyEpoch != epoch || replyGeneration != generation || operation.epoch != replyEpoch
                    || operation.generation != replyGeneration || replyRevision <= revision) return false;
            revision = replyRevision;
            projectedPlaying = playing;
            pending.remove(operation);
            if (pending.isEmpty()) {
                SettableFuture<Void> completed = barrier;
                barrier = null;
                completed.set(null);
            }
            // While the barrier is pending, invalidateState cannot publish this result.
            invalidateState();
            return true;
        }
        void interrupt() {
            interrupting = true;
            generation++;
            blocked = true;
            projectedPlaying = false; // Unavailable/unknown, not proof of remote silence.
            SettableFuture<Void> oldBarrier = barrier;
            barrier = null;
            pending.clear();
            try {
                if (oldBarrier != null) oldBarrier.cancel(false);
                invalidateState();
            } finally {
                interrupting = false;
            }
        }
        boolean explicitResumeForTest() {
            if (interrupting) return false;
            blocked = false;
            invalidateState();
            return true;
        }
    }

    @Test
    public void sharedBarrierDefersUpdatesAndBlocksListenerReentry() {
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
            BarrierPlayer player = new BarrierPlayer(true);
            player.pause();
            player.play();
            assertEquals(2, player.pending.size());
            BarrierPlayer.Operation first = player.pending.get(0);
            BarrierPlayer.Operation second = player.pending.get(1);
            assertSame("Both operations share one player-facing pending future", first.barrier, second.barrier);
            assertTrue(player.reply(first, first.epoch, first.generation, 1, false));
            assertTrue("Remaining operation delays publication of the first result", player.isPlaying());
            assertFalse(first.barrier.isDone());

            AtomicBoolean playerListenerRan = new AtomicBoolean();
            AtomicBoolean listenerSawPlaying = new AtomicBoolean();
            AtomicBoolean listenerSawCommand = new AtomicBoolean();
            AtomicBoolean listenerResumed = new AtomicBoolean();
            player.addListener(new Player.Listener() {
                @Override public void onPlaybackStateChanged(int state) {
                    if (state != Player.STATE_IDLE || !player.interrupting) return;
                    playerListenerRan.set(true);
                    listenerSawPlaying.set(player.isPlaying());
                    listenerSawCommand.set(player.isCommandAvailable(Player.COMMAND_PLAY_PAUSE));
                    listenerResumed.set(player.explicitResumeForTest());
                    player.play();
                }
            });
            AtomicBoolean lateListenerRan = new AtomicBoolean();
            AtomicBoolean lateListenerSawPlaying = new AtomicBoolean();
            first.barrier.addListener(() -> {
                lateListenerRan.set(true);
                lateListenerSawPlaying.set(player.isPlaying());
            }, MoreExecutors.directExecutor());
            player.interrupt();
            assertTrue(playerListenerRan.get());
            assertFalse("Player callback observes the blocked projection", listenerSawPlaying.get());
            assertFalse(listenerSawCommand.get());
            assertFalse("Resume is rejected until interrupt cleanup completes", listenerResumed.get());
            assertTrue(lateListenerRan.get());
            assertFalse("This later-registered callback observes the blocked projection", lateListenerSawPlaying.get());
            assertTrue(first.barrier.isCancelled());
            assertTrue(player.pending.isEmpty());
            assertEquals("Reentry did not issue a command", 2, player.issued);
            assertFalse(player.isPlaying());
            assertEquals(Player.STATE_IDLE, player.getPlaybackState());
            assertFalse(player.isCommandAvailable(Player.COMMAND_PLAY_PAUSE));

            assertTrue(player.explicitResumeForTest());
            player.play();
            BarrierPlayer.Operation current = player.pending.get(0);
            assertNotSame("A fresh round needs a new barrier", first.barrier, current.barrier);
            assertFalse(player.reply(second, second.epoch, second.generation, 999, true));
            assertFalse(current.barrier.isDone());
            assertFalse(player.isPlaying());
            assertTrue(player.reply(current, current.epoch, current.generation, 2, true));
            assertTrue(player.isPlaying());
        });
    }

    @Test
    public void sharedBarrierCannotPreventAnEarlierCompletionListenerSeeingStaleState() {
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
            BarrierPlayer player = new BarrierPlayer(true);
            AtomicBoolean earlyListenerRan = new AtomicBoolean();
            AtomicBoolean observedStalePlaying = new AtomicBoolean();
            AtomicBoolean earlyListenerResumed = new AtomicBoolean();
            player.earlyCompletionListener = () -> {
                earlyListenerRan.set(true);
                observedStalePlaying.set(player.isPlaying());
                earlyListenerResumed.set(player.explicitResumeForTest());
                player.play();
            };
            player.pause();
            player.play();
            assertSame(player.pending.get(0).barrier, player.pending.get(1).barrier);
            player.interrupt();
            assertTrue(earlyListenerRan.get());
            assertTrue("A listener registered before Media3 can read stale playing", observedStalePlaying.get());
            assertFalse(earlyListenerResumed.get());
            assertEquals("The handler must check the block despite stale commands", 1, player.blockedAttempts);
            assertEquals(2, player.issued);
            assertFalse(player.isPlaying());
            assertEquals(Player.STATE_IDLE, player.getPlaybackState());
        });
    }
}
