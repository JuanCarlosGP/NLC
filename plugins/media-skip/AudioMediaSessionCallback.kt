package expo.modules.audio.service

import android.os.Bundle
import androidx.media3.common.Player
import androidx.media3.session.MediaSession
import androidx.media3.session.SessionCommand
import androidx.media3.session.SessionResult
import androidx.annotation.OptIn
import androidx.media3.common.util.UnstableApi
import com.google.common.util.concurrent.ListenableFuture

@OptIn(UnstableApi::class)
class AudioMediaSessionCallback : MediaSession.Callback {
  override fun onConnect(
    session: MediaSession,
    controller: MediaSession.ControllerInfo
  ): MediaSession.ConnectionResult {
    try {
      // NLC_MEDIA_SKIP — keep next/prev player commands so SystemUI renders skip.
      return MediaSession.ConnectionResult.AcceptedResultBuilder(session)
        .setAvailablePlayerCommands(
          MediaSession.ConnectionResult.DEFAULT_PLAYER_COMMANDS.buildUpon()
            .add(Player.COMMAND_SEEK_IN_CURRENT_MEDIA_ITEM)
            .add(Player.COMMAND_SEEK_FORWARD)
            .add(Player.COMMAND_SEEK_BACK)
            .add(Player.COMMAND_SEEK_TO_PREVIOUS)
            .add(Player.COMMAND_SEEK_TO_NEXT)
            .add(Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM)
            .add(Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM)
            .build()
        )
        .setAvailableSessionCommands(
          MediaSession.ConnectionResult.DEFAULT_SESSION_COMMANDS.buildUpon()
            .add(SessionCommand(AudioControlsService.ACTION_SEEK_BACKWARD, Bundle.EMPTY))
            .add(SessionCommand(AudioControlsService.ACTION_SEEK_FORWARD, Bundle.EMPTY))
            .add(SessionCommand(AudioControlsService.ACTION_PREVIOUS, Bundle.EMPTY))
            .add(SessionCommand(AudioControlsService.ACTION_NEXT, Bundle.EMPTY))
            .build()
        )
        .build()
    } catch (e: Exception) {
      return MediaSession.ConnectionResult.reject()
    }
  }

  override fun onCustomCommand(
    session: MediaSession,
    controller: MediaSession.ControllerInfo,
    command: SessionCommand,
    args: Bundle
  ): ListenableFuture<SessionResult> {
    when (command.customAction) {
      AudioControlsService.ACTION_SEEK_FORWARD -> {
        session.player.seekTo(session.player.currentPosition + AudioControlsService.SEEK_INTERVAL_MS)
      }
      AudioControlsService.ACTION_SEEK_BACKWARD -> {
        session.player.seekTo(session.player.currentPosition - AudioControlsService.SEEK_INTERVAL_MS)
      }
      AudioControlsService.ACTION_PREVIOUS -> {
        AudioControlsService.getInstance()?.emitSkip("previous")
      }
      AudioControlsService.ACTION_NEXT -> {
        AudioControlsService.getInstance()?.emitSkip("next")
      }
    }
    return super.onCustomCommand(session, controller, command, args)
  }
}
