package expo.modules.audio.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.Binder
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.media.MediaMetadata as PlatformMediaMetadata
import android.media.session.MediaSession as PlatformMediaSession
import android.util.Log
import androidx.annotation.OptIn
import androidx.core.app.NotificationCompat
import androidx.media3.common.Player
import androidx.media3.common.MediaMetadata as Media3Metadata
import androidx.media3.common.util.UnstableApi
import androidx.media3.session.CommandButton
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService
import androidx.media3.session.MediaStyleNotificationHelper
import androidx.media3.session.SessionCommand
import androidx.media3.session.legacy.MediaMetadataCompat
import androidx.media3.session.legacy.MediaSessionCompat
import expo.modules.audio.AudioLockScreenOptions
import expo.modules.audio.AudioPlayer
import expo.modules.audio.Metadata
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import java.io.ByteArrayOutputStream
import java.net.URL

// NLC_MEDIA_SKIP
@OptIn(UnstableApi::class)
class AudioControlsService : MediaSessionService() {
  private val binder = AudioControlsBinder()
  private var mediaSession: MediaSession? = null
  private var lockScreenPlayer: LockScreenPlayer? = null
  private var currentMetadata: Metadata? = null
  private var currentPlayer: AudioPlayer? = null
  private var currentOptions: AudioLockScreenOptions? = null
  private val scope = CoroutineScope(Dispatchers.IO)
  private var currentArtworkUrl: URL? = null
  private var currentArtwork: Bitmap? = null
  private var currentArtworkBytes: ByteArray? = null

  private var playbackListener: Player.Listener? = null

  inner class AudioControlsBinder : Binder() {
    fun getService(): AudioControlsService = this@AudioControlsService
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_PLAY -> withPlayerOnAppThread { it.play() }
      ACTION_PAUSE -> withPlayerOnAppThread { it.pause() }
      ACTION_TOGGLE -> withPlayerOnAppThread { player ->
        if (player.isPlaying) player.pause() else player.play()
      }

      ACTION_SEEK_FORWARD -> withPlayerOnAppThread { player ->
        player.seekTo(player.currentPosition + SEEK_INTERVAL_MS)
      }

      ACTION_SEEK_BACKWARD -> withPlayerOnAppThread { player ->
        player.seekTo(player.currentPosition - SEEK_INTERVAL_MS)
      }

      ACTION_PREVIOUS -> currentPlayer?.emitLockScreenSkip("previous")
      ACTION_NEXT -> currentPlayer?.emitLockScreenSkip("next")
    }

    postOrStartForegroundNotification(startInForeground = false)
    return super.onStartCommand(intent, flags, startId)
  }

  override fun onCreate() {
    super.onCreate()
    instance = this
    cleanupLegacyNotifications()
    createNotificationChannelIfNeeded()

    pendingPlayer?.let { player ->
      setActivePlayerInternal(player, pendingMetadata, pendingOptions)
      pendingPlayer = null
      pendingMetadata = null
      pendingOptions = null
    }
  }

  private fun cleanupLegacyNotifications() {
    val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    try {
      notificationManager.cancel(369280525) // "expo_audio_channel".hashCode()
      notificationManager.cancel(164804584)
      notificationManager.cancel(230243838)
      notificationManager.cancel(200013983)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        notificationManager.deleteNotificationChannel("expo_audio_channel")
      }
    } catch (_: Exception) {
      // Best-effort cleanup
    }
  }

  private fun createNotificationChannelIfNeeded() {
    val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      if (notificationManager.getNotificationChannel(CHANNEL_ID) == null) {
        notificationManager.createNotificationChannel(
          NotificationChannel(
            CHANNEL_ID,
            "Reproducción",
            NotificationManager.IMPORTANCE_LOW
          ).apply {
            description = "Controles de NLC"
            setShowBadge(false)
          }
        )
      }
    }
  }

  private fun buildContentIntent(): PendingIntent? {
    val appIntent = packageManager.getLaunchIntentForPackage(packageName) ?: return null
    return PendingIntent.getActivity(
      this,
      0,
      appIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
  }

  private fun getNotificationSmallIcon(): Int {
    return resources.getIdentifier("notification_icon", "drawable", packageName).takeIf { it != 0 }
      ?: applicationInfo.icon.takeIf { it != 0 }
      ?: androidx.media3.session.R.drawable.media3_icon_circular_play
  }

  private fun buildNotification(): Notification? {
    val session = mediaSession ?: return null

    val builder = NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(getNotificationSmallIcon())
      .setContentTitle(currentMetadata?.title ?: "\u200E")
      .setContentText(currentMetadata?.artist)
      .setSubText(currentMetadata?.albumTitle)
      .setLargeIcon(currentArtwork)
      .setContentIntent(buildContentIntent())
      .setAutoCancel(false)
      .setOngoing(true)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setCategory(NotificationCompat.CATEGORY_TRANSPORT)
      .setStyle(MediaStyleNotificationHelper.MediaStyle(session))

    return builder.build()
  }

  private fun updateSessionCustomLayout(isPlaying: Boolean) {
    val session = mediaSession ?: return
    val customLayout = mutableListOf<CommandButton>()

    if (currentOptions?.showPreviousTrack == true) {
      customLayout.add(
        CommandButton.Builder(CommandButton.ICON_PREVIOUS)
          .setDisplayName("Previous")
          .setEnabled(true)
          .setSessionCommand(SessionCommand(ACTION_PREVIOUS, Bundle.EMPTY))
          .build()
      )
    }

    if (currentOptions?.showSeekBackward == true) {
      customLayout.add(
        CommandButton.Builder(CommandButton.ICON_SKIP_BACK)
          .setDisplayName("Seek Backward")
          .setEnabled(true)
          .setSessionCommand(SessionCommand(ACTION_SEEK_BACKWARD, Bundle.EMPTY))
          .build()
      )
    }

    customLayout.add(
      CommandButton.Builder(if (isPlaying) CommandButton.ICON_PAUSE else CommandButton.ICON_PLAY)
        .setDisplayName(if (isPlaying) "Pause" else "Play")
        .setEnabled(true)
        .setPlayerCommand(Player.COMMAND_PLAY_PAUSE)
        .build()
    )

    if (currentOptions?.showSeekForward == true) {
      customLayout.add(
        CommandButton.Builder(CommandButton.ICON_SKIP_FORWARD)
          .setDisplayName("Seek Forward")
          .setEnabled(true)
          .setSessionCommand(SessionCommand(ACTION_SEEK_FORWARD, Bundle.EMPTY))
          .build()
      )
    }

    if (currentOptions?.showNextTrack == true) {
      customLayout.add(
        CommandButton.Builder(CommandButton.ICON_NEXT)
          .setDisplayName("Next")
          .setEnabled(true)
          .setSessionCommand(SessionCommand(ACTION_NEXT, Bundle.EMPTY))
          .build()
      )
    }

    session.setCustomLayout(customLayout)
  }

  private fun scaleBitmapForMediaMetadata(source: Bitmap): Bitmap {
    val maxDim = 512
    val width = source.width
    val height = source.height
    if (width <= 0 || height <= 0) return source

    val (scaledW, scaledH) = if (width > maxDim || height > maxDim) {
      if (width >= height) {
        val w = maxDim
        val h = (height.toFloat() / width.toFloat() * maxDim).toInt().coerceAtLeast(1)
        Pair(w, h)
      } else {
        val h = maxDim
        val w = (width.toFloat() / height.toFloat() * maxDim).toInt().coerceAtLeast(1)
        Pair(w, h)
      }
    } else {
      Pair(width, height)
    }

    val scaled = if (scaledW != width || scaledH != height) {
      Bitmap.createScaledBitmap(source, scaledW, scaledH, true)
    } else {
      source
    }
    // Convert to RGB_565 to halve memory footprint and stay safely under Binder 1MB transaction buffer
    return scaled.copy(Bitmap.Config.RGB_565, false) ?: scaled
  }

  private fun getSessionCompat(): MediaSessionCompat? {
    val session = mediaSession ?: return null
    return try {
      val implField = session.javaClass.getDeclaredField("impl").apply { isAccessible = true }
      val impl = implField.get(session) ?: return null
      val stubField = impl.javaClass.getDeclaredField("sessionLegacyStub").apply { isAccessible = true }
      val stub = stubField.get(impl) ?: return null
      val compatField = stub.javaClass.getDeclaredField("sessionCompat").apply { isAccessible = true }
      compatField.get(stub) as? MediaSessionCompat
    } catch (e: Exception) {
      null
    }
  }

  private fun getPlatformMediaSession(): PlatformMediaSession? {
    return try {
      val compat = getSessionCompat() ?: return null
      compat.mediaSession as? PlatformMediaSession
    } catch (e: Exception) {
      null
    }
  }

  private fun updateSessionMetadata() {
    val title = currentMetadata?.title ?: ""
    val artist = currentMetadata?.artist ?: ""
    val album = currentMetadata?.albumTitle ?: ""
    val artworkUrlStr = currentArtworkUrl?.toString()

    // 1. Media3 metadata (for Media3 controllers)
    val metaBuilder = Media3Metadata.Builder()
      .setTitle(title)
      .setArtist(artist)
      .setAlbumTitle(album)

    currentArtworkBytes?.let { bytes ->
      if (bytes.isNotEmpty()) {
        metaBuilder.setArtworkData(bytes, Media3Metadata.PICTURE_TYPE_FRONT_COVER)
      }
    }
    if (artworkUrlStr != null) {
      try {
        metaBuilder.setArtworkUri(android.net.Uri.parse(artworkUrlStr))
      } catch (_: Exception) {}
    }
    val media3Metadata = metaBuilder.build()
    lockScreenPlayer?.customMetadata = media3Metadata
    withPlayerOnAppThread { p ->
      p.setPlaylistMetadata(media3Metadata)
    }

    // 2. Set high-resolution artwork directly onto the platform MediaSession & MediaSessionCompat.
    // This feeds Android 13/14/15 SystemUI's MediaDataManager directly with a crisp full-res bitmap,
    // bypassing the 113x113 downscaled Notification.EXTRA_LARGE_ICON fallback.
    val highResBitmap = currentArtwork?.let { scaleBitmapForMediaMetadata(it) }

    try {
      val platformSession = getPlatformMediaSession()
      if (platformSession != null) {
        val platformMetaBuilder = PlatformMediaMetadata.Builder()
          .putString(PlatformMediaMetadata.METADATA_KEY_TITLE, title)
          .putString(PlatformMediaMetadata.METADATA_KEY_ARTIST, artist)
          .putString(PlatformMediaMetadata.METADATA_KEY_ALBUM, album)
          .putString(PlatformMediaMetadata.METADATA_KEY_ALBUM_ARTIST, artist)
          .putString(PlatformMediaMetadata.METADATA_KEY_DISPLAY_TITLE, title)
          .putString(PlatformMediaMetadata.METADATA_KEY_DISPLAY_SUBTITLE, artist)
          .putString(PlatformMediaMetadata.METADATA_KEY_DISPLAY_DESCRIPTION, album)

        if (artworkUrlStr != null) {
          platformMetaBuilder.putString(PlatformMediaMetadata.METADATA_KEY_ALBUM_ART_URI, artworkUrlStr)
          platformMetaBuilder.putString(PlatformMediaMetadata.METADATA_KEY_ART_URI, artworkUrlStr)
          platformMetaBuilder.putString(PlatformMediaMetadata.METADATA_KEY_DISPLAY_ICON_URI, artworkUrlStr)
        }

        if (highResBitmap != null) {
          platformMetaBuilder.putBitmap(PlatformMediaMetadata.METADATA_KEY_ALBUM_ART, highResBitmap)
          platformMetaBuilder.putBitmap(PlatformMediaMetadata.METADATA_KEY_ART, highResBitmap)
          platformMetaBuilder.putBitmap(PlatformMediaMetadata.METADATA_KEY_DISPLAY_ICON, highResBitmap)
        }

        platformSession.setMetadata(platformMetaBuilder.build())
      }
    } catch (e: Exception) {
      Log.w("AudioControlsService", "Could not set platform MediaMetadata", e)
    }

    try {
      val compat = getSessionCompat()
      if (compat != null) {
        val compatBuilder = MediaMetadataCompat.Builder()
          .putString(MediaMetadataCompat.METADATA_KEY_TITLE, title)
          .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, artist)
          .putString(MediaMetadataCompat.METADATA_KEY_ALBUM, album)
          .putString(MediaMetadataCompat.METADATA_KEY_ALBUM_ARTIST, artist)
          .putString(MediaMetadataCompat.METADATA_KEY_DISPLAY_TITLE, title)
          .putString(MediaMetadataCompat.METADATA_KEY_DISPLAY_SUBTITLE, artist)
          .putString(MediaMetadataCompat.METADATA_KEY_DISPLAY_DESCRIPTION, album)

        if (artworkUrlStr != null) {
          compatBuilder.putString(MediaMetadataCompat.METADATA_KEY_ALBUM_ART_URI, artworkUrlStr)
          compatBuilder.putString(MediaMetadataCompat.METADATA_KEY_ART_URI, artworkUrlStr)
          compatBuilder.putString(MediaMetadataCompat.METADATA_KEY_DISPLAY_ICON_URI, artworkUrlStr)
        }

        if (highResBitmap != null) {
          compatBuilder.putBitmap(MediaMetadataCompat.METADATA_KEY_ALBUM_ART, highResBitmap)
          compatBuilder.putBitmap(MediaMetadataCompat.METADATA_KEY_ART, highResBitmap)
          compatBuilder.putBitmap(MediaMetadataCompat.METADATA_KEY_DISPLAY_ICON, highResBitmap)
        }

        compat.setMetadata(compatBuilder.build())
      }
    } catch (e: Exception) {
      Log.w("AudioControlsService", "Could not set MediaMetadataCompat", e)
    }
  }

  private fun postOrStartForegroundNotification(startInForeground: Boolean) {
    val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    val notification = buildNotification() ?: return

    if (startInForeground) {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        startForeground(
          NOTIFICATION_ID,
          notification,
          ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
        )
      } else {
        startForeground(NOTIFICATION_ID, notification)
      }
    } else {
      notificationManager.notify(NOTIFICATION_ID, notification)
    }
  }

  override fun onUpdateNotification(session: MediaSession, startInForegroundRequired: Boolean) {
    postOrStartForegroundNotification(startInForegroundRequired)
  }

  private fun releaseCurrentSession() {
    mediaSession?.let { session ->
      try {
        removeSession(session)
      } catch (_: Exception) {
        // Session may already be gone.
      }
      session.release()
    }
    mediaSession = null
    lockScreenPlayer = null
  }

  private fun setActivePlayerInternal(
    player: AudioPlayer?,
    metadata: Metadata? = null,
    options: AudioLockScreenOptions? = null
  ) {
    if (player == null) {
      clearSessionInternal()
      return
    }

    if (currentPlayer != null && currentPlayer !== player) {
      playbackListener?.let { listener ->
        currentPlayer?.ref?.removeListener(listener)
      }
      playbackListener = null
      currentPlayer?.isActiveForLockScreen = false
    }

    currentPlayer = player
    currentMetadata = metadata
    currentOptions = options
    player.isActiveForLockScreen = true

    // Reuse existing MediaSession whenever possible to preserve MediaSession.Token
    // and prevent Android SystemUI from creating duplicate cards in Quick Settings.
    val existingSession = mediaSession
    if (existingSession == null) {
      val wrapper = LockScreenPlayer(player.ref) { direction ->
        currentPlayer?.emitLockScreenSkip(direction)
      }
      lockScreenPlayer = wrapper
      val session = MediaSession.Builder(this, wrapper)
        .setId(SESSION_ID)
        .setCallback(AudioMediaSessionCallback())
        .build()

      addSession(session)
      mediaSession = session
    } else {
      val wrapper = LockScreenPlayer(player.ref) { direction ->
        currentPlayer?.emitLockScreenSkip(direction)
      }
      lockScreenPlayer = wrapper
      existingSession.setPlayer(wrapper)
    }

    if (playbackListener == null) {
      val listener = object : Player.Listener {
        override fun onIsPlayingChanged(isPlaying: Boolean) {
          updateSessionCustomLayout(isPlaying)
          postOrStartForegroundNotification(startInForeground = false)
        }

        override fun onPlaybackStateChanged(playbackState: Int) {
          postOrStartForegroundNotification(startInForeground = false)
        }
      }
      playbackListener = listener
      player.ref.addListener(listener)
    }

    updateSessionCustomLayout(player.ref.isPlaying)

    val artworkUrl = metadata?.artworkUrl
    if (artworkUrl != null) {
      if (artworkUrl != currentArtworkUrl) {
        currentArtwork = null
        currentArtworkBytes = null
      }
      loadArtworkFromUrl(artworkUrl)
    } else {
      currentArtwork = null
      currentArtworkBytes = null
      currentArtworkUrl = null
    }

    updateSessionMetadata()
    postOrStartForegroundNotification(startInForeground = true)
  }

  private fun updateMetadataInternal(player: AudioPlayer, metadata: Metadata?) {
    if (player != currentPlayer || metadata == currentMetadata) {
      return
    }
    currentMetadata = metadata
    val artworkUrl = metadata?.artworkUrl
    if (artworkUrl != null) {
      if (artworkUrl != currentArtworkUrl) {
        currentArtwork = null
        currentArtworkBytes = null
      }
      loadArtworkFromUrl(artworkUrl)
    } else {
      currentArtwork = null
      currentArtworkBytes = null
      currentArtworkUrl = null
    }
    updateSessionMetadata()
    postOrStartForegroundNotification(startInForeground = false)
  }

  private fun clearSessionInternal() {
    currentPlayer?.isActiveForLockScreen = false
    playbackListener?.let { listener ->
      currentPlayer?.ref?.removeListener(listener)
    }
    playbackListener = null
    currentPlayer = null
    currentMetadata = null
    currentArtwork = null
    currentArtworkBytes = null
    currentArtworkUrl = null
    hideNotification()
    stopForeground(STOP_FOREGROUND_REMOVE)
    // NOTE: Keep mediaSession instance alive across track changes so Android's
    // MediaSession.Token is stable and doesn't spawn new cards in the shade.
  }

  override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? {
    return mediaSession
  }

  private fun withPlayerOnAppThread(block: (Player) -> Unit) {
    val player = currentPlayer?.ref ?: return
    val looper: Looper = player.applicationLooper
    if (Looper.myLooper() == looper) {
      block(player)
    } else {
      Handler(looper).post { block(player) }
    }
  }

  override fun onBind(intent: Intent?): IBinder {
    return super.onBind(intent) ?: binder
  }

  private fun loadArtworkFromUrl(url: URL) {
    if (url == currentArtworkUrl && currentArtwork != null) {
      return
    }
    currentArtworkUrl = url
    scope.launch {
      try {
        val connection = url.openConnection()
        connection.connectTimeout = 8000
        connection.readTimeout = 8000
        val bytes = connection.getInputStream().use { it.readBytes() }
        if (bytes.isEmpty()) return@launch

        val bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
        if (bitmap != null) {
          Log.d("AudioControlsService", "Loaded artwork: ${bitmap.width}x${bitmap.height}, ${bytes.size} bytes from $url")
          val safeBytes = if (bytes.size > 500_000) {
            val out = ByteArrayOutputStream()
            bitmap.compress(Bitmap.CompressFormat.JPEG, 90, out)
            out.toByteArray()
          } else {
            bytes
          }

          if (url == currentArtworkUrl) {
            currentArtwork = bitmap
            currentArtworkBytes = safeBytes
            updateSessionMetadata()
            postOrStartForegroundNotification(startInForeground = false)
          }
        }
      } catch (e: Exception) {
        Log.w("AudioControlsService", "Failed to load artwork from $url", e)
        if (url == currentArtworkUrl) {
          currentArtworkUrl = null
        }
      }
    }
  }

  fun emitSkip(direction: String) {
    currentPlayer?.emitLockScreenSkip(direction)
  }

  private fun hideNotification() {
    val notificationManager: NotificationManager =
      getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    notificationManager.cancel(NOTIFICATION_ID)
  }

  override fun onDestroy() {
    super.onDestroy()
    instance = null
    try {
      scope.cancel()
    } catch (e: Exception) {
      //
    }
    releaseCurrentSession()
    currentPlayer = null
    lockScreenPlayer = null
  }

  companion object {
    private const val CHANNEL_ID = "nlc_playback"
    private const val SESSION_ID = "nlc-playback"
    private const val NOTIFICATION_ID = 0x4E4C43

    private const val ACTION_PLAY = "expo.modules.audio.action.PLAY"
    private const val ACTION_PAUSE = "expo.modules.audio.action.PAUSE"
    private const val ACTION_TOGGLE = "expo.modules.audio.action.TOGGLE"

    const val ACTION_SEEK_FORWARD = "expo.modules.audio.action.SEEK_FORWARD"
    const val ACTION_SEEK_BACKWARD = "expo.modules.audio.action.SEEK_REWIND"
    const val ACTION_PREVIOUS = "expo.modules.audio.action.PREVIOUS"
    const val ACTION_NEXT = "expo.modules.audio.action.NEXT"

    const val SEEK_INTERVAL_MS = 10000L

    private var pendingPlayer: AudioPlayer? = null
    private var pendingMetadata: Metadata? = null
    private var pendingOptions: AudioLockScreenOptions? = null

    @Volatile
    private var instance: AudioControlsService? = null

    fun getInstance(): AudioControlsService? = instance

    fun setActivePlayer(
      context: Context,
      player: AudioPlayer?,
      metadata: Metadata? = null,
      options: AudioLockScreenOptions? = null
    ) {
      val service = getInstance()
      if (service != null) {
        service.setActivePlayerInternal(player, metadata, options)
      } else {
        val intent = Intent(context, AudioControlsService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          context.startForegroundService(intent)
        } else {
          context.startService(intent)
        }

        pendingPlayer = player
        pendingMetadata = metadata
        pendingOptions = options
      }
    }

    fun updateMetadata(player: AudioPlayer, metadata: Metadata?) {
      getInstance()?.updateMetadataInternal(player, metadata)
    }

    fun clearSession() {
      getInstance()?.clearSessionInternal()
    }
  }
}
