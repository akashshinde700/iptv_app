package com.streamkaro.app.player;

import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.TextUtils;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.TextView;
import android.widget.Toast;

import androidx.activity.OnBackPressedCallback;
import androidx.annotation.Nullable;
import androidx.annotation.OptIn;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.media3.common.AudioAttributes;
import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.common.Tracks;
import androidx.media3.common.VideoSize;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.datasource.DefaultDataSource;
import androidx.media3.datasource.DefaultHttpDataSource;
import androidx.media3.exoplayer.DefaultRenderersFactory;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
import androidx.media3.exoplayer.util.DebugTextViewHelper;
import androidx.media3.ui.AspectRatioFrameLayout;
import androidx.media3.ui.PlayerView;
import androidx.media3.ui.TrackSelectionDialogBuilder;

import com.streamkaro.app.R;

/**
 * Full-screen native (Media3 ExoPlayer) player for the Android / Android TV shells.
 *
 * Launched by {@link NativePlayerPlugin} with an absolute, signed /api/proxy URL, so
 * portal credentials never reach the device. Compared to the WebView + hls.js player
 * it plays raw MPEG-TS, HEVC and AC3/EAC3 on TV boxes whose WebView can't.
 *
 * Several behaviours are adapted from SmartTube (MIT, github.com/yuliskov/SmartTube):
 * RAM-scaled buffering, decoder fallback, behind-live-window recovery, zoom modes,
 * track pickers, auto frame rate and a stats overlay.
 */
@OptIn(markerClass = UnstableApi.class)
public class PlayerActivity extends AppCompatActivity {

    public static final String EXTRA_URL = "url";
    public static final String EXTRA_TITLE = "title";
    public static final String EXTRA_MIME_TYPE = "mimeType";
    public static final String EXTRA_HAS_PREVIOUS = "hasPrevious";
    public static final String EXTRA_HAS_NEXT = "hasNext";

    public static final String RESULT_REASON = "reason";
    public static final String RESULT_MESSAGE = "message";
    public static final String RESULT_ERROR_KIND = "errorKind";

    private static final int MAX_RETRIES = 3;
    private static final String PREFS = "sk_player";
    private static final String PREF_RESIZE = "resizeMode";
    private static final String PREF_AFR = "autoFrameRate";
    private static final String PREF_STATS = "stats";

    private static final int[] RESIZE_MODES = {
        AspectRatioFrameLayout.RESIZE_MODE_FIT,
        AspectRatioFrameLayout.RESIZE_MODE_ZOOM,
        AspectRatioFrameLayout.RESIZE_MODE_FILL,
    };
    private static final String[] RESIZE_LABELS = { "Fit", "Zoom", "Stretch" };

    private final Handler handler = new Handler(Looper.getMainLooper());

    private SharedPreferences prefs;
    private PlayerView playerView;
    private TextView statsView;
    private View liveBadge;
    private View timeBarRow;
    private Button qualityButton;
    private Button audioButton;
    private Button subtitlesButton;
    private Button zoomButton;
    private Button frameRateButton;
    private Button statsButton;

    @Nullable private ExoPlayer player;
    @Nullable private DebugTextViewHelper debugHelper;
    private AutoFrameRate autoFrameRate;

    private String url;
    @Nullable private String title;
    @Nullable private String mimeType;
    private int retries = 0;
    private int resizeIndex = 0;
    private boolean hasPrevious;
    private boolean hasNext;

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        setContentView(R.layout.sk_activity_player);

        Intent intent = getIntent();
        url = intent.getStringExtra(EXTRA_URL);
        title = intent.getStringExtra(EXTRA_TITLE);
        mimeType = intent.getStringExtra(EXTRA_MIME_TYPE);
        if (TextUtils.isEmpty(url)) {
            finishWith("error", "No stream URL", "other");
            return;
        }

        prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        autoFrameRate = new AutoFrameRate(this);

        playerView = findViewById(R.id.sk_player_view);
        statsView = findViewById(R.id.sk_stats);
        // The controller layout is inflated by PlayerView, so its children are reachable here.
        liveBadge = playerView.findViewById(R.id.sk_live_badge);
        timeBarRow = playerView.findViewById(R.id.sk_timebar_row);
        qualityButton = playerView.findViewById(R.id.sk_quality);
        audioButton = playerView.findViewById(R.id.sk_audio);
        subtitlesButton = playerView.findViewById(R.id.sk_subtitles);
        zoomButton = playerView.findViewById(R.id.sk_zoom);
        frameRateButton = playerView.findViewById(R.id.sk_frame_rate);
        statsButton = playerView.findViewById(R.id.sk_stats_toggle);
        TextView titleView = playerView.findViewById(R.id.sk_title);
        titleView.setText(TextUtils.isEmpty(title) ? "" : title);

        // Previous / next channel from the list the viewer opened this channel from.
        hasPrevious = intent.getBooleanExtra(EXTRA_HAS_PREVIOUS, false);
        hasNext = intent.getBooleanExtra(EXTRA_HAS_NEXT, false);
        Button previousButton = playerView.findViewById(R.id.sk_prev_channel);
        Button nextButton = playerView.findViewById(R.id.sk_next_channel);
        previousButton.setVisibility(hasPrevious ? View.VISIBLE : View.GONE);
        nextButton.setVisibility(hasNext ? View.VISIBLE : View.GONE);
        previousButton.setOnClickListener(v -> finishWith("previous", null, null));
        nextButton.setOnClickListener(v -> finishWith("next", null, null));

        playerView.setControllerShowTimeoutMs(5000);
        playerView.setShowBuffering(PlayerView.SHOW_BUFFERING_ALWAYS);
        playerView.setKeepContentOnPlayerReset(true);

        qualityButton.setOnClickListener(v -> showTrackDialog(C.TRACK_TYPE_VIDEO, "Quality"));
        audioButton.setOnClickListener(v -> showTrackDialog(C.TRACK_TYPE_AUDIO, "Audio"));
        subtitlesButton.setOnClickListener(v -> showTrackDialog(C.TRACK_TYPE_TEXT, "Subtitles"));
        zoomButton.setOnClickListener(v -> cycleResizeMode());
        statsButton.setOnClickListener(v -> setStatsEnabled(!prefs.getBoolean(PREF_STATS, false)));

        if (AutoFrameRate.isSupported(this)) {
            frameRateButton.setVisibility(View.VISIBLE);
            frameRateButton.setOnClickListener(v -> toggleAutoFrameRate());
            updateFrameRateLabel();
        }

        resizeIndex = Math.max(0, Math.min(RESIZE_MODES.length - 1, prefs.getInt(PREF_RESIZE, 0)));
        applyResizeMode(false);

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (playerView.isControllerFullyVisible()) {
                    playerView.hideController();
                } else {
                    finishWith("closed", null, null);
                }
            }
        });
    }

    @Override
    protected void onStart() {
        super.onStart();
        if (url != null && player == null) initializePlayer();
    }

    @Override
    protected void onResume() {
        super.onResume();
        hideSystemBars();
    }

    @Override
    protected void onStop() {
        super.onStop();
        releasePlayer();
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        // Remotes with a menu key jump straight to the option buttons.
        if (keyCode == KeyEvent.KEYCODE_MENU && playerView != null) {
            playerView.showController();
            zoomButton.requestFocus();
            return true;
        }
        if ((keyCode == KeyEvent.KEYCODE_CHANNEL_UP || keyCode == KeyEvent.KEYCODE_MEDIA_NEXT) && hasNext) {
            finishWith("next", null, null);
            return true;
        }
        if ((keyCode == KeyEvent.KEYCODE_CHANNEL_DOWN || keyCode == KeyEvent.KEYCODE_MEDIA_PREVIOUS) && hasPrevious) {
            finishWith("previous", null, null);
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        // Controls hidden: Up / Down zap channels like a set-top box; OK still shows the controls.
        if (event.getAction() == KeyEvent.ACTION_DOWN && playerView != null && !playerView.isControllerFullyVisible()) {
            int code = event.getKeyCode();
            if (code == KeyEvent.KEYCODE_DPAD_UP && hasPrevious) {
                finishWith("previous", null, null);
                return true;
            }
            if (code == KeyEvent.KEYCODE_DPAD_DOWN && hasNext) {
                finishWith("next", null, null);
                return true;
            }
        }
        return super.dispatchKeyEvent(event);
    }

    /* ------------------------------ Player setup ------------------------------ */

    private void initializePlayer() {
        DefaultRenderersFactory renderers = new DefaultRenderersFactory(this)
            // Cheap TV boxes often expose a broken primary decoder — fall back to the next one.
            .setEnableDecoderFallback(true)
            .setExtensionRendererMode(DefaultRenderersFactory.EXTENSION_RENDERER_MODE_PREFER);

        DefaultHttpDataSource.Factory http = new DefaultHttpDataSource.Factory()
            .setUserAgent("StreamKaro-Android (Media3)")
            .setAllowCrossProtocolRedirects(true)
            .setConnectTimeoutMs(15_000)
            .setReadTimeoutMs(25_000);

        ExoPlayer exo = new ExoPlayer.Builder(this, renderers)
            .setMediaSourceFactory(new DefaultMediaSourceFactory(new DefaultDataSource.Factory(this, http)))
            .setLoadControl(PlayerTuning.buildLoadControl(this))
            .setAudioAttributes(
                new AudioAttributes.Builder()
                    .setUsage(C.USAGE_MEDIA)
                    .setContentType(C.AUDIO_CONTENT_TYPE_MOVIE)
                    .build(),
                true
            )
            .setHandleAudioBecomingNoisy(true)
            .setWakeMode(C.WAKE_MODE_NETWORK)
            .build();
        exo.addListener(listener);
        player = exo;
        playerView.setPlayer(exo);

        MediaItem.Builder item = new MediaItem.Builder()
            .setUri(url)
            .setMediaMetadata(new MediaMetadata.Builder().setTitle(title).build());
        // The proxy path hides the upstream extension, so the web side passes a type hint.
        if (!TextUtils.isEmpty(mimeType)) item.setMimeType(mimeType);

        exo.setMediaItem(item.build());
        exo.setPlayWhenReady(true);
        exo.prepare();

        if (prefs.getBoolean(PREF_STATS, false)) setStatsEnabled(true);
    }

    private void releasePlayer() {
        handler.removeCallbacksAndMessages(null);
        if (debugHelper != null) {
            debugHelper.stop();
            debugHelper = null;
        }
        if (player != null) {
            player.removeListener(listener);
            player.release();
            player = null;
        }
        if (playerView != null) playerView.setPlayer(null);
    }

    private final Player.Listener listener = new Player.Listener() {
        @Override
        public void onPlaybackStateChanged(int state) {
            if (player == null) return;
            if (state == Player.STATE_READY) {
                retries = 0;
                boolean live = player.isCurrentMediaItemLive() || player.getDuration() == C.TIME_UNSET;
                liveBadge.setVisibility(live ? View.VISIBLE : View.GONE);
                timeBarRow.setVisibility(live ? View.GONE : View.VISIBLE);
            } else if (state == Player.STATE_ENDED) {
                // A live TS connection that simply closed — reconnect instead of exiting.
                if (player.isCurrentMediaItemLive() || player.getDuration() == C.TIME_UNSET) {
                    scheduleRetry("Stream ended");
                } else {
                    finishWith("ended", null, null);
                }
            }
        }

        @Override
        public void onPlayerError(PlaybackException error) {
            if (player == null) return;
            if (error.errorCode == PlaybackException.ERROR_CODE_BEHIND_LIVE_WINDOW) {
                player.seekToDefaultPosition();
                player.prepare();
                return;
            }
            String kind = classify(error);
            boolean retryable = "network".equals(kind)
                && error.errorCode != PlaybackException.ERROR_CODE_IO_BAD_HTTP_STATUS
                && error.errorCode != PlaybackException.ERROR_CODE_IO_FILE_NOT_FOUND;
            if (retryable) {
                scheduleRetry(messageFor(kind));
            } else {
                finishWith("error", messageFor(kind), kind);
            }
        }

        @Override
        public void onTracksChanged(Tracks tracks) {
            qualityButton.setVisibility(countTracks(tracks, C.TRACK_TYPE_VIDEO) > 1 ? View.VISIBLE : View.GONE);
            audioButton.setVisibility(countTracks(tracks, C.TRACK_TYPE_AUDIO) > 1 ? View.VISIBLE : View.GONE);
            subtitlesButton.setVisibility(countTracks(tracks, C.TRACK_TYPE_TEXT) > 0 ? View.VISIBLE : View.GONE);
        }

        @Override
        public void onVideoSizeChanged(VideoSize videoSize) {
            if (player != null && prefs.getBoolean(PREF_AFR, false)) {
                autoFrameRate.apply(player.getVideoFormat());
            }
        }
    };

    private void scheduleRetry(String message) {
        if (retries >= MAX_RETRIES) {
            finishWith("error", message, "network");
            return;
        }
        retries++;
        Toast.makeText(this, "Reconnecting… (" + retries + "/" + MAX_RETRIES + ")", Toast.LENGTH_SHORT).show();
        handler.postDelayed(() -> {
            if (player == null) return;
            player.seekToDefaultPosition();
            player.prepare();
            player.setPlayWhenReady(true);
        }, 1500L * retries);
    }

    private static String classify(PlaybackException error) {
        int code = error.errorCode;
        if (code >= 2000 && code < 3000) return "network"; // ERROR_CODE_IO_*
        if (code >= 3000 && code < 5000) return "decode";  // parsing + decoding
        return "other";
    }

    private static String messageFor(String kind) {
        switch (kind) {
            case "network":
                return "This channel is currently unavailable.";
            case "decode":
                return "This channel can't be played on this device.";
            default:
                return "This channel couldn't be played.";
        }
    }

    private static int countTracks(Tracks tracks, int type) {
        int n = 0;
        for (Tracks.Group group : tracks.getGroups()) {
            if (group.getType() == type) n += group.length;
        }
        return n;
    }

    /* ------------------------------ Controls ------------------------------ */

    private void showTrackDialog(int trackType, String dialogTitle) {
        if (player == null) return;
        new TrackSelectionDialogBuilder(this, dialogTitle, player, trackType)
            .setAllowAdaptiveSelections(false)
            .setShowDisableOption(trackType == C.TRACK_TYPE_TEXT)
            .build()
            .show();
    }

    private void cycleResizeMode() {
        resizeIndex = (resizeIndex + 1) % RESIZE_MODES.length;
        prefs.edit().putInt(PREF_RESIZE, resizeIndex).apply();
        applyResizeMode(true);
    }

    private void applyResizeMode(boolean announce) {
        playerView.setResizeMode(RESIZE_MODES[resizeIndex]);
        String label = "Zoom: " + RESIZE_LABELS[resizeIndex];
        zoomButton.setText(label);
        if (announce) Toast.makeText(this, label, Toast.LENGTH_SHORT).show();
    }

    private void toggleAutoFrameRate() {
        boolean enabled = !prefs.getBoolean(PREF_AFR, false);
        prefs.edit().putBoolean(PREF_AFR, enabled).apply();
        if (enabled && player != null) {
            autoFrameRate.apply(player.getVideoFormat());
        } else {
            autoFrameRate.reset();
        }
        updateFrameRateLabel();
    }

    private void updateFrameRateLabel() {
        frameRateButton.setText(prefs.getBoolean(PREF_AFR, false) ? "Match frame rate: On" : "Match frame rate: Off");
    }

    private void setStatsEnabled(boolean enabled) {
        prefs.edit().putBoolean(PREF_STATS, enabled).apply();
        if (debugHelper != null) {
            debugHelper.stop();
            debugHelper = null;
        }
        if (enabled && player != null) {
            debugHelper = new DebugTextViewHelper(player, statsView);
            debugHelper.start();
        }
        statsView.setVisibility(enabled ? View.VISIBLE : View.GONE);
    }

    private void hideSystemBars() {
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        WindowInsetsControllerCompat controller =
            WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        controller.hide(WindowInsetsCompat.Type.systemBars());
        controller.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
    }

    private void finishWith(String reason, @Nullable String message, @Nullable String errorKind) {
        Intent data = new Intent();
        data.putExtra(RESULT_REASON, reason);
        if (message != null) data.putExtra(RESULT_MESSAGE, message);
        if (errorKind != null) data.putExtra(RESULT_ERROR_KIND, errorKind);
        setResult(RESULT_OK, data);
        finish();
    }
}
