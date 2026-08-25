package expo.modules.audio.service

import androidx.annotation.OptIn
import androidx.media3.common.ForwardingPlayer
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi

/**
 * NLC_MEDIA_SKIP
 * SystemUI (Android 13+) only shows skip if the session player advertises
 * SEEK_TO_NEXT / SEEK_TO_PREVIOUS. expo-audio uses a single MediaItem, so
 * ExoPlayer hides those commands — wrap and route them to the JS queue.
 */
@OptIn(UnstableApi::class)
class LockScreenPlayer(
  player: Player,
  private val onSkip: (String) -> Unit,
) : ForwardingPlayer(player) {
  override fun getAvailableCommands(): Player.Commands {
    return super.getAvailableCommands().buildUpon()
      .add(Player.COMMAND_SEEK_TO_NEXT)
      .add(Player.COMMAND_SEEK_TO_PREVIOUS)
      .add(Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM)
      .add(Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM)
      .build()
  }

  override fun isCommandAvailable(command: Int): Boolean {
    return when (command) {
      Player.COMMAND_SEEK_TO_NEXT,
      Player.COMMAND_SEEK_TO_PREVIOUS,
      Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM,
      Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM -> true
      else -> super.isCommandAvailable(command)
    }
  }

  override fun hasNextMediaItem(): Boolean = true

  override fun hasPreviousMediaItem(): Boolean = true

  override fun seekToNext() {
    onSkip("next")
  }

  override fun seekToPrevious() {
    onSkip("previous")
  }

  override fun seekToNextMediaItem() {
    onSkip("next")
  }

  override fun seekToPreviousMediaItem() {
    onSkip("previous")
  }
}
