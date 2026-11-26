function ensureYouTubeApi(cb) {
if (window.YT && window.YT.Player) {
cb();
return;
}
window.onYouTubeIframeAPIReady = function () {
cb();
};
if (!document.getElementById('yt-api-script')) {
var tag = document.createElement('script');
tag.id = 'yt-api-script';
tag.src = 'https://www.youtube.com/iframe_api';
document.head.appendChild(tag);
}
}
function loadYouTubeVideo(videoId, startSec, shouldPlay) {
pendingYtVideoId = videoId;
pendingYtStart = Math.max(0, Math.floor(startSec || 0));
pendingYtPlay = Boolean(shouldPlay);
ensureYouTubeApi(function () {
if (ytPlayer && ytReady && ytPlayer.loadVideoById) {
ytPlayer.loadVideoById({
videoId: pendingYtVideoId,
startSeconds: pendingYtStart
});
if (!pendingYtPlay && ytPlayer.pauseVideo) {
setTimeout(function () { ytPlayer.pauseVideo(); }, 400);
}
standbyOverlay.style.display = 'none';
return;
}
ytReady = false;
ytPlayer = new window.YT.Player('yt-player', {
videoId: pendingYtVideoId,
playerVars: {
autoplay: 1,
controls: 1,
rel: 0,
playsinline: 1,
start: pendingYtStart
},
events: {
onReady: function (ev) {
ytReady = true;
standbyOverlay.style.display = 'none';
try {
ev.target.setVolume(Math.round(currentVolume * 100));
if (pendingYtPlay) ev.target.playVideo();
else ev.target.pauseVideo();
} catch (e) {}
},
onError: function () {
triggerPlaybackFailover('YouTube error');
}
}
});
});
}
function destroyHls() {
if (hlsInstance) {
try { hlsInstance.destroy(); } catch (e) {}
hlsInstance = null;
}
}
function clearEmbedFrame() {
if (embedWrap) embedWrap.style.display = 'none';
if (embedFrame) {
try { embedFrame.src = 'about:blank'; } catch (e) {}
}
}
function extractTvTrackHostKey(rawUrl) {
var s = String(rawUrl || '').trim();
if (!s) return '';
if (s.indexOf('/api/hls-proxy') === 0 || s.indexOf('/api/dvb-live') === 0) {
var mUrl = s.match(/[?&]url=([^&]+)/);
if (mUrl && mUrl[1]) {
try { s = decodeURIComponent(mUrl[1]); } catch (e) { s = mUrl[1]; }
}
}
var belixMatch = s.match(/\/api\/belix\/stream\/(\d+)/i);
if (belixMatch && belixMatch[1]) {
return 'belix://stream/' + belixMatch[1];
}
var dvbMatch = s.match(/90\.163\.85\.113:8093\/stream\/(\d+)/i);
if (dvbMatch && dvbMatch[1]) {
return 'dvb://90.163.85.113:8093/stream/' + dvbMatch[1];
}
return s.split('#')[0].split('?')[0].toLowerCase();
}
var tvDirectTranscodeRetried = false;
var tvDirectTranscodeTimer = null;
function clearVideoWatchdog() {
if (videoWatchdogTimer) {
clearTimeout(videoWatchdogTimer);
videoWatchdogTimer = null;
}
if (tvDirectTranscodeTimer) {
clearTimeout(tvDirectTranscodeTimer);
tvDirectTranscodeTimer = null;
}
}
function tryTvDirectTranscodeRetry() {
if (tvDirectTranscodeRetried || !videoEl || currentMode !== 'direct' || !currentUrl) return false;
if (!/^\/api\/(?:stream|xtream\/vod\/|providers\/stream\/)/i.test(currentUrl)) return false;
tvDirectTranscodeRetried = true;
if (tvDirectTranscodeTimer) {
clearTimeout(tvDirectTranscodeTimer);
tvDirectTranscodeTimer = null;
}
var sep = currentUrl.indexOf('?') === -1 ? '?' : '&';
var transcodedUrl = currentUrl + sep + 'transcode=1';
currentUrl = transcodedUrl;
try {
videoEl.src = transcodedUrl;
videoEl.load();
} catch (e) {}
return true;
}
function reportTvQoeMetric(sourceUrl, opts) {
try {
if (!sourceUrl) return;
var payload = {
platform: 'smart-tv',
startupMs: opts && typeof opts.startupMs === 'number' ? opts.startupMs : 0,
rebufferCount: opts && typeof opts.rebufferCount === 'number' ? opts.rebufferCount : 0,
rebufferMs: opts && typeof opts.rebufferMs === 'number' ? opts.rebufferMs : 0,
stallFailoverUsed: Boolean(opts && opts.stallFailoverUsed),
failed: Boolean(opts && opts.failed),
sourceUrl: String(sourceUrl).slice(0, 550)
};
xhrJson('POST', '/api/metrics/qoe', payload, function () {});
} catch (e) {}
}
var tvStreamLoadStartMs = 0;
var tvRebufferCount = 0;
var tvCorruptFrameChecks = 0;
var tvLastCorruptCount = 0;
var videoZeroStartupAt = 0;
function stopLiveStallMonitor() {
if (videoStallWatchInterval) {
clearInterval(videoStallWatchInterval);
videoStallWatchInterval = null;
}
videoLastProgressTime = -1;
videoStallStartedAt = 0;
videoZeroStartupAt = 0;
tvCorruptFrameChecks = 0;
tvLastCorruptCount = 0;
}
function startLiveStallMonitor() {
stopLiveStallMonitor();
videoStallWatchInterval = setInterval(function () {
if (
activeScreen !== 'player' ||
!currentIsLive ||
!videoEl ||
videoEl.paused ||
autoFailoverLock ||
(currentMode !== 'hls' && currentMode !== 'direct')
) {
videoStallStartedAt = 0;
videoZeroStartupAt = 0;
return;
}
if (videoEl.readyState >= 2 && videoEl.currentTime > 1.2 && (!videoEl.videoWidth || videoEl.videoWidth === 0)) {
tvCorruptFrameChecks++;
if (tvCorruptFrameChecks >= 3) {
tvCorruptFrameChecks = 0;
triggerPlaybackFailover('Sin imagen de vídeo');
return;
}
} else if (videoEl.getVideoPlaybackQuality) {
var qInfo = videoEl.getVideoPlaybackQuality();
var curCorrupt = qInfo && typeof qInfo.corruptedVideoFrames === 'number' ? qInfo.corruptedVideoFrames : 0;
if (curCorrupt - tvLastCorruptCount >= 8) {
tvLastCorruptCount = curCorrupt;
triggerPlaybackFailover('Macrobloques detectados');
return;
}
}
if (videoEl.readyState < 2 || !videoEl.videoWidth || videoEl.videoWidth === 0) {
if (videoLastProgressTime < 0) {
var zeroNowMs = Date.now();
if (!videoZeroStartupAt) {
videoZeroStartupAt = zeroNowMs;
} else if (zeroNowMs - videoZeroStartupAt >= 5200) {
videoZeroStartupAt = 0;
triggerPlaybackFailover('Tiempo de arranque agotado');
}
}
return;
}
videoZeroStartupAt = 0;
var curT = Number(videoEl.currentTime || 0);
if (videoLastProgressTime < 0 || Math.abs(curT - videoLastProgressTime) >= 0.05) {
videoLastProgressTime = curT;
videoStallStartedAt = 0;
return;
}
var nowMs = Date.now();
if (!videoStallStartedAt) {
videoStallStartedAt = nowMs;
tvRebufferCount++;
return;
}
if (nowMs - videoStallStartedAt >= 5200) {
videoStallStartedAt = 0;
triggerPlaybackFailover('Señal congelada');
}
}, 1000);
}
function markVideoFrameActive() {
clearVideoWatchdog();
autoFailoverLock = false;
videoZeroStartupAt = 0;
if (videoEl) {
videoLastProgressTime = Number(videoEl.currentTime || 0);
videoStallStartedAt = 0;
}
if (tvStreamLoadStartMs > 0 && currentUrl) {
var elapsedStartup = Date.now() - tvStreamLoadStartMs;
tvStreamLoadStartMs = 0;
reportTvQoeMetric(currentUrl, { startupMs: elapsedStartup, rebufferCount: tvRebufferCount, failed: false });
}
if (standbyOverlay && standbyOverlay.style.display !== 'none') {
standbyOverlay.style.display = 'none';
}
syncPlayPauseButton();
}
if (videoEl) {
videoEl.addEventListener('playing', markVideoFrameActive);
videoEl.addEventListener('pause', syncPlayPauseButton);
videoEl.addEventListener('loadeddata', function () {
if (videoEl.videoWidth > 0) markVideoFrameActive();
});
videoEl.addEventListener('timeupdate', function () {
if (!currentIsLive && videoEl.duration && !isNaN(videoEl.duration) && videoEl.duration > 0) {
if (dockTimeCur) dockTimeCur.textContent = formatSecClock(videoEl.currentTime || 0);
if (dockTimeDur) dockTimeDur.textContent = formatSecClock(videoEl.duration);
if (dockProgressFill) {
var pct = Math.min(100, Math.max(0, (videoEl.currentTime / videoEl.duration) * 100));
dockProgressFill.style.width = pct.toFixed(1) + '%';
}
}
});
videoEl.addEventListener('error', function () {
if (currentMode === 'idle' || currentMode === 'embed' || currentMode === 'youtube') return;
if (currentMode === 'direct' && tryTvDirectTranscodeRetry()) return;
if (!isLocalPlayback) {
if (currentMode === 'hls' && currentUrl && currentUrl.indexOf('/api/hls-proxy') !== -1 && currentUrl.indexOf('abs=1') === -1) {
var absUrl = currentUrl + (currentUrl.indexOf('?') === -1 ? '?' : '&') + 'abs=1';
applyVideoState({
mode: 'hls',
url: absUrl,
title: hudTitle.textContent,
subtitle: hudSub.textContent,
currentTime: videoEl.currentTime || 0,
isPlaying: true,
isLive: currentIsLive
}, true);
return;
}
showStandbyError(hudTitle.textContent || 'RIFFAN TV', tvT('signalTempUnavail') + ' (Smart TV Decode Error).');
return;
}
triggerPlaybackFailover('Video decode error');
});
}
function playVideoSafely(targetResumeSec, shouldPlay) {
if (targetResumeSec > 3) {
try {
if (Math.abs((videoEl.currentTime || 0) - targetResumeSec) > 2.5) {
videoEl.currentTime = targetResumeSec;
}
} catch (e) {}
}
if (!shouldPlay) {
try { videoEl.pause(); } catch (e) {}
syncPlayPauseButton();
return;
}
videoEl.muted = false;
videoEl.volume = currentVolume;
var playPromise = videoEl.play();
if (playPromise && playPromise.then) {
playPromise.then(
function () {
unmuteBanner.style.display = 'none';
syncPlayPauseButton();
},
function () {
videoEl.muted = true;
var p2 = videoEl.play();
if (p2 && p2.catch) p2.catch(function () {});
unmuteBanner.style.display = 'block';
syncPlayPauseButton();
setTimeout(function () {
if (
activeScreen === 'player' &&
!isMiniGuideOpen &&
unmuteBanner &&
unmuteBanner.style.display !== 'none' &&
(!standbyOverlay || standbyOverlay.style.display === 'none')
) {
var uBtn = document.getElementById('btn-unmute-now');
if (uBtn && uBtn.focus) uBtn.focus();
}
}, 120);
}
);
}
}
function triggerPlaybackFailover(reasonText) {
if (autoFailoverLock) return;
if (!isLocalPlayback) {
autoFailoverLock = true;
clearVideoWatchdog();
if (currentUrl && currentUrl.indexOf('/api/hls-proxy') !== -1 && currentUrl.indexOf('abs=1') === -1) {
var upgraded = currentUrl + (currentUrl.indexOf('?') === -1 ? '?' : '&') + 'abs=1';
autoFailoverLock = false;
applyVideoState({
mode: currentMode,
url: upgraded,
title: hudTitle.textContent,
subtitle: hudSub.textContent,
currentTime: videoEl.currentTime || 0,
isPlaying: true,
isLive: currentIsLive
}, true);
return;
}
showStandbyError(hudTitle.textContent || 'RIFFAN TV', tvT('signalTempUnavail') + (reasonText ? ' (' + reasonText + ')' : '') + '.');
return;
}
autoFailoverLock = true;
clearVideoWatchdog();
if (activeLiveChannel) {
var ch = activeLiveChannel;
var totalChTracks = ch.channels ? ch.channels.length : 0;
activeLiveFailedTrackIdxs[activeLiveTrackIdx] = true;
var curTrackObj = ch.channels && ch.channels[activeLiveTrackIdx] ? ch.channels[activeLiveTrackIdx] : null;
var curTrackUrl = curTrackObj ? (curTrackObj.sourceUrl || curTrackObj.resolvedStreamUrl || '') : (currentUrl || '');
reportTvQoeMetric(curTrackUrl || currentUrl, {
startupMs: tvStreamLoadStartMs > 0 ? (Date.now() - tvStreamLoadStartMs) : 4000,
rebufferCount: Math.max(1, tvRebufferCount),
stallFailoverUsed: true,
failed: true
});
var deadHostKey = extractTvTrackHostKey(curTrackUrl);
if (deadHostKey) {
activeLiveFailedHostKeys[deadHostKey] = true;
}
var nextTrackIdx = -1;
var ti;
for (ti = activeLiveTrackIdx + 1; ti < totalChTracks; ti++) {
if (activeLiveFailedTrackIdxs[ti]) continue;
var candTr = ch.channels[ti];
var candUrl = candTr ? (candTr.resolvedStreamUrl || candTr.sourceUrl || candTr.url || '') : '';
if (!candUrl) continue;
var candHost = extractTvTrackHostKey(candUrl);
if (candHost && activeLiveFailedHostKeys[candHost]) continue;
nextTrackIdx = ti;
break;
}
if (nextTrackIdx === -1) {
for (ti = 0; ti < activeLiveTrackIdx; ti++) {
if (activeLiveFailedTrackIdxs[ti]) continue;
var candPrev = ch.channels[ti];
var candPrevUrl = candPrev ? (candPrev.resolvedStreamUrl || candPrev.sourceUrl || candPrev.url || '') : '';
if (!candPrevUrl) continue;
var candPrevHost = extractTvTrackHostKey(candPrevUrl);
if (candPrevHost && activeLiveFailedHostKeys[candPrevHost]) continue;
nextTrackIdx = ti;
break;
}
}
if (nextTrackIdx !== -1) {
showToast(tvT('switchingBackup') + ' (' + (nextTrackIdx + 1) + '/' + totalChTracks + ')');
setTimeout(function () {
autoFailoverLock = false;
playTdtChannelOnTv(ch, nextTrackIdx, true);
}, 150);
return;
}
if (ch.id && !ch._isSportsMatch && String(ch.id).indexOf('tv-ucl-') !== 0 && currentUrl.indexOf('/api/iptv/live/') === -1) {
showToast(tvT('connectingIptv'));
setTimeout(function () {
autoFailoverLock = false;
applyVideoState(
{
mode: 'hls',
url: '/api/iptv/live/' + encodeURIComponent(ch.id) + '.m3u8',
title: ch.name,
subtitle: (ch.network || 'TDT / TV') + ' · IPTV',
logoUrl: ch.logoUrl || '',
isPlaying: true,
isLive: true,
currentTime: 0
},
true
);
}, 150);
return;
}
showStandbyError(ch.name, tvT('signalTempUnavail') + (reasonText ? ' (' + reasonText + ')' : '') + '.');
return;
}
if (localTracks && localTrackIdx + 1 < localTracks.length) {
showToast(tvT('switchingServer'));
setTimeout(function () {
autoFailoverLock = false;
switchToLocalTrack(localTrackIdx + 1, !currentIsLive ? (videoEl.currentTime || 0) : 0);
}, 200);
return;
}
showStandbyError(hudTitle.textContent || 'RIFFAN TV', tvT('noServerAvail'));
}
function showStandbyError(titleStr, msgStr) {
clearVideoWatchdog();
stopLiveStallMonitor();
destroyHls();
clearEmbedFrame();
try {
videoEl.pause();
videoEl.removeAttribute('src');
videoEl.load();
} catch (e) {}
videoEl.style.display = 'none';
if (standbySpinner) standbySpinner.style.display = 'none';
if (btnStandbyRetry) {
btnStandbyRetry.style.display = (localTracks && localTracks.length > 1) ? 'inline-flex' : 'none';
}
standbyOverlay.style.display = 'flex';
standbyRoomPill.textContent = tvT('signalUnavailable');
standbyTitleText.textContent = titleStr || 'RIFFAN TV';
standbySubText.textContent = msgStr || tvT('standbySubFallback');
setTimeout(function () {
var exitB = document.getElementById('btn-standby-exit');
if (exitB && exitB.focus) exitB.focus();
}, 60);
}
function applyVideoState(vs, forceReload) {
if (!vs) return;
if (!vs.preserveMulti && typeof stopTvMultiPlayback === 'function') {
stopTvMultiPlayback(true);
}
var nextMode = vs.mode || 'idle';
var nextUrl = vs.url || '';
var shouldPlay = Boolean(vs.isPlaying);
var isLive = Boolean(vs.isLive);
var targetSec = !isLive && vs.currentTime > 0 ? Number(vs.currentTime) : 0;
hudTitle.textContent = vs.title || 'RIFFAN TV';
hudSub.textContent = vs.subtitle || (isPaired ? tvT('roomPrefix') + currentRoomId.toUpperCase() + ' · 1080p' : 'Smart TV 1080p');
var chLogo = vs.logoUrl || (activeLiveChannel && activeLiveChannel.logoUrl) || '';
if (hudLogoWrap && hudLogoImg) {
if (chLogo) {
hudLogoImg.src = chLogo;
hudLogoWrap.style.display = 'flex';
} else {
hudLogoWrap.style.display = 'none';
}
}
if (standbyChannelBadge && standbyLogoImg) {
if (chLogo) {
standbyLogoImg.src = chLogo;
standbyChannelBadge.style.display = 'flex';
} else {
standbyChannelBadge.style.display = 'none';
}
}
syncPlayerDockMode(isLive);
if (nextMode === 'idle' || !nextUrl) {
currentMode = 'idle';
currentUrl = '';
clearVideoWatchdog();
stopLiveStallMonitor();
destroyHls();
clearEmbedFrame();
try {
videoEl.pause();
videoEl.removeAttribute('src');
videoEl.load();
} catch (e) {}
if (ytPlayer && ytPlayer.stopVideo) {
try { ytPlayer.stopVideo(); } catch (e) {}
}
ytWrap.style.display = 'none';
videoEl.style.display = 'none';
if (standbySpinner) standbySpinner.style.display = 'none';
if (btnStandbyRetry) btnStandbyRetry.style.display = 'none';
standbyOverlay.style.display = 'flex';
unmuteBanner.style.display = 'none';
return;
}
if (!forceReload && nextMode === currentMode && nextUrl === currentUrl) {
if (nextMode === 'hls' || nextMode === 'direct') {
if (!isLive && Math.abs((videoEl.currentTime || 0) - targetSec) > 3.5) {
try { videoEl.currentTime = targetSec; } catch (e) {}
}
if (shouldPlay && videoEl.paused) playVideoSafely(0, true);
else if (!shouldPlay && !videoEl.paused) videoEl.pause();
} else if (nextMode === 'youtube' && ytPlayer && ytReady) {
try {
var ytTime = ytPlayer.getCurrentTime ? ytPlayer.getCurrentTime() : 0;
if (!isLive && Math.abs(ytTime - targetSec) > 4) ytPlayer.seekTo(targetSec, true);
var state = ytPlayer.getPlayerState ? ytPlayer.getPlayerState() : -1;
if (shouldPlay && state !== 1 && state !== 3) ytPlayer.playVideo();
else if (!shouldPlay && state === 1) ytPlayer.pauseVideo();
} catch (e) {}
}
return;
}
currentMode = nextMode;
currentUrl = nextUrl;
currentIsLive = isLive;
tvStreamLoadStartMs = Date.now();
tvRebufferCount = 0;
autoFailoverLock = false;
clearVideoWatchdog();
if (!isLive) {
revealHud();
}
if (nextMode === 'youtube') {
destroyHls();
clearEmbedFrame();
try {
videoEl.pause();
videoEl.removeAttribute('src');
videoEl.load();
} catch (e) {}
videoEl.style.display = 'none';
ytWrap.style.display = 'block';
if (standbySpinner) standbySpinner.style.display = 'block';
standbyOverlay.style.display = 'flex';
loadYouTubeVideo(nextUrl, targetSec, shouldPlay);
return;
}
if (nextMode === 'embed' || nextMode === 'cloud') {
destroyHls();
try {
videoEl.pause();
videoEl.removeAttribute('src');
videoEl.load();
} catch (e) {}
if (ytPlayer && ytPlayer.stopVideo) {
try { ytPlayer.stopVideo(); } catch (e) {}
}
ytWrap.style.display = 'none';
videoEl.style.display = 'none';
if (embedWrap && embedFrame) {
embedWrap.style.display = 'block';
if (standbySpinner) standbySpinner.style.display = 'block';
standbyOverlay.style.display = 'flex';
embedFrame.onload = function () {
standbyOverlay.style.display = 'none';
};
embedFrame.src = nextUrl;
setTimeout(function () {
if (currentMode === 'embed' || currentMode === 'cloud') {
standbyOverlay.style.display = 'none';
}
}, 2400);
}
return;
}
if (ytPlayer && ytPlayer.stopVideo) {
try { ytPlayer.stopVideo(); } catch (e) {}
}
ytWrap.style.display = 'none';
clearEmbedFrame();
videoEl.style.display = 'block';
if (standbySpinner) standbySpinner.style.display = 'block';
if (btnStandbyRetry) btnStandbyRetry.style.display = 'none';
standbyOverlay.style.display = 'flex';
destroyHls();
tvDirectTranscodeRetried = /[?&](?:transcode=1|remux=mp4)\b/i.test(nextUrl);
videoWatchdogTimer = setTimeout(function () {
if (currentMode !== nextMode || currentUrl !== nextUrl) return;
if (!videoEl.videoWidth || videoEl.videoWidth === 0 || videoEl.readyState < 2) {
triggerPlaybackFailover('Tiempo de carga agotado');
}
}, isLive ? 5500 : 8000);
if (isLive) startLiveStallMonitor();
else stopLiveStallMonitor();
if (nextMode === 'direct') {
if (/^\/api\/(?:stream|xtream\/vod\/|providers\/stream\/)/i.test(nextUrl) && !tvDirectTranscodeRetried) {
tvDirectTranscodeTimer = setTimeout(function () {
if (currentMode === 'direct' && currentUrl === nextUrl && videoEl && videoEl.readyState === 0) {
tryTvDirectTranscodeRetry();
}
}, 5500);
}
videoEl.src = nextUrl;
videoEl.onloadedmetadata = function () {
if (tvDirectTranscodeTimer) {
clearTimeout(tvDirectTranscodeTimer);
tvDirectTranscodeTimer = null;
}
playVideoSafely(targetSec, shouldPlay);
};
return;
}
if (window.Hls && window.Hls.isSupported()) {
var directCorsRetried = false;
var fallbackNativeTried = false;
var netErrorCount = 0;
var mediaErrorCount = 0;
var switchToNativeHls = function () {
if (fallbackNativeTried) {
triggerPlaybackFailover('Error de reproducción HLS');
return;
}
fallbackNativeTried = true;
var resumeT = !isLive && videoEl.currentTime > 1 ? videoEl.currentTime : targetSec;
destroyHls();
videoEl.src = nextUrl;
videoEl.onloadedmetadata = function () {
playVideoSafely(resumeT, shouldPlay);
};
};
var isDvbLive =
nextUrl.indexOf('/api/dvb-live/') !== -1 ||
nextUrl.indexOf('/api/belix/stream/') !== -1 ||
nextUrl.indexOf('/api/providers/stream/') !== -1 ||
nextUrl.indexOf('/api/xtream/stream/') !== -1 ||
nextUrl.indexOf('/api/iptv/live/') !== -1 ||
nextUrl.indexOf('/api/stream') !== -1;
var hls = new window.Hls({
enableWorker: !isSmartTvUa,
lowLatencyMode: false,
startFragPrefetch: true,
startPosition: isLive ? -1 : targetSec,
liveSyncDurationCount: isLive ? 2 : 3,
liveMaxLatencyDurationCount: isLive ? 8 : 12,
maxLiveSyncPlaybackRate: isLive ? 1.04 : 1,
backBufferLength: isLive ? 20 : 30,
maxBufferLength: isLive ? 36 : 42,
maxMaxBufferLength: isLive ? 72 : 90,
maxBufferHole: isLive ? 0.8 : 0.6,
highBufferWatchdogPeriod: 2,
nudgeOffset: isLive ? 0.15 : 0.1,
nudgeMaxRetry: 12,
capLevelToPlayerSize: true,
maxAudioFramesDrift: isLive ? 3 : 4,
abrEwmaDefaultEstimate: isLive ? 4500000 : 5500000,
manifestLoadingTimeOut: isDvbLive ? 5000 : 6000,
manifestLoadingMaxRetry: 2,
manifestLoadingRetryDelay: 200,
levelLoadingTimeOut: 5500,
levelLoadingMaxRetry: 2,
levelLoadingRetryDelay: 200,
fragLoadingTimeOut: 7000,
fragLoadingMaxRetry: 3,
fragLoadingRetryDelay: 250
});
hlsInstance = hls;
hls.loadSource(nextUrl);
hls.attachMedia(videoEl);
hls.on(window.Hls.Events.MANIFEST_PARSED, function () {
playVideoSafely(targetSec, shouldPlay);
});
var nonFatalMediaErrors = 0;
var nonFatalNetErrors = 0;
var lastNonFatalMediaAt = 0;
hls.on(window.Hls.Events.FRAG_BUFFERED, function () {
nonFatalMediaErrors = 0;
nonFatalNetErrors = 0;
if (videoEl && videoEl.videoWidth > 0 && videoEl.readyState >= 2) {
markVideoFrameActive();
}
});
hls.on(window.Hls.Events.ERROR, function (_ev, data) {
if (!data) return;
if (!data.fatal) {
if (
isLive &&
window.Hls &&
window.Hls.ErrorDetails &&
(data.details === window.Hls.ErrorDetails.FRAG_LOAD_ERROR ||
data.details === window.Hls.ErrorDetails.FRAG_LOAD_TIMEOUT ||
data.details === window.Hls.ErrorDetails.LEVEL_LOAD_ERROR ||
data.details === window.Hls.ErrorDetails.LEVEL_LOAD_TIMEOUT ||
data.details === window.Hls.ErrorDetails.BUFFER_STALLED_ERROR ||
data.details === window.Hls.ErrorDetails.MANIFEST_LOAD_ERROR)
) {
nonFatalNetErrors++;
if (nonFatalNetErrors >= 3 && (!videoEl || videoEl.readyState < 3 || !videoEl.videoWidth)) {
nonFatalNetErrors = 0;
triggerPlaybackFailover('Corte en la señal');
return;
}
}
if (
data.type === window.Hls.ErrorTypes.MEDIA_ERROR &&
(data.details === window.Hls.ErrorDetails.FRAG_PARSING_ERROR ||
data.details === window.Hls.ErrorDetails.BUFFER_APPEND_ERROR)
) {
nonFatalMediaErrors++;
var nowMs = Date.now();
if (nonFatalMediaErrors >= 5) {
nonFatalMediaErrors = 0;
triggerPlaybackFailover('Trama de vídeo corrupta');
return;
}
if (nonFatalMediaErrors >= 3 && nowMs - lastNonFatalMediaAt > 12000) {
lastNonFatalMediaAt = nowMs;
try { hls.recoverMediaError(); } catch (e) {}
}
}
return;
}
if (data.type === window.Hls.ErrorTypes.NETWORK_ERROR) {
netErrorCount++;
if (!directCorsRetried && nextUrl.indexOf('http') === 0 && nextUrl.indexOf('/api/') === -1) {
directCorsRetried = true;
var proxied = '/api/hls-proxy/stream.m3u8?abs=1&url=' + encodeURIComponent(nextUrl);
currentUrl = proxied;
hls.loadSource(proxied);
return;
}
if (!directCorsRetried && currentUrl.indexOf('/api/hls-proxy') !== -1 && currentUrl.indexOf('abs=1') === -1) {
directCorsRetried = true;
var absProxied = currentUrl + (currentUrl.indexOf('?') === -1 ? '?' : '&') + 'abs=1';
currentUrl = absProxied;
hls.loadSource(absProxied);
return;
}
if (netErrorCount <= 1) {
setTimeout(function () {
if (hlsInstance === hls) hls.startLoad();
}, 250);
} else {
triggerPlaybackFailover('Señal de red interrumpida');
}
} else if (data.type === window.Hls.ErrorTypes.MEDIA_ERROR) {
mediaErrorCount++;
if (mediaErrorCount <= 2) {
hls.recoverMediaError();
} else if (videoEl.canPlayType && videoEl.canPlayType('application/vnd.apple.mpegurl')) {
switchToNativeHls();
} else {
triggerPlaybackFailover('Error de códec de vídeo');
}
} else {
if (videoEl.canPlayType && videoEl.canPlayType('application/vnd.apple.mpegurl')) {
switchToNativeHls();
} else {
triggerPlaybackFailover('Error de formato HLS');
}
}
});
} else {
videoEl.src = nextUrl;
videoEl.onloadedmetadata = function () {
playVideoSafely(targetSec, shouldPlay);
};
}
}
function handleRemoteCommand(cmd) {
if (cmd === 'vol_up' || cmd === 'vol_down') {
var delta = cmd === 'vol_up' ? 0.15 : -0.15;
currentVolume = Math.max(0, Math.min(1, Math.round((currentVolume + delta) * 100) / 100));
if (videoEl) {
videoEl.volume = currentVolume;
if (currentVolume > 0) videoEl.muted = false;
}
if (ytPlayer && ytPlayer.setVolume) {
try {
ytPlayer.setVolume(Math.round(currentVolume * 100));
if (currentVolume > 0 && ytPlayer.unMute) ytPlayer.unMute();
} catch (e) {}
}
showToast(tvT('volumeToast') + Math.round(currentVolume * 100) + '%');
} else if (cmd === 'toggle_mute') {
if (videoEl) {
videoEl.muted = !videoEl.muted;
showToast(videoEl.muted ? tvT('mutedToast') : tvT('unmutedToast'));
}
if (ytPlayer) {
try {
if (ytPlayer.isMuted && ytPlayer.isMuted()) ytPlayer.unMute();
else if (ytPlayer.mute) ytPlayer.mute();
} catch (e) {}
}
} else if (cmd === 'toggle_fullscreen') {
requestTvFullscreen(true);
} else if (cmd === 'toggle_aspect') {
cycleVideoAspect();
} else if (cmd === 'toggle_hud') {
if (!isHudVisible()) revealHud();
else hideHudImmediately();
} else if (cmd === 'reload_tv') {
if (activeLiveChannel) {
playTdtChannelOnTv(activeLiveChannel, activeLiveTrackIdx);
showToast(tvT('resyncCh'));
} else if (currentMode !== 'idle' && currentUrl) {
applyVideoState(
{
mode: currentMode,
url: currentUrl,
title: hudTitle.textContent,
subtitle: hudSub.textContent,
currentTime: videoEl.currentTime || 0,
isPlaying: true,
isLive: currentIsLive
},
true
);
showToast(tvT('resyncHd'));
}
} else if (cmd === 'disconnect_tv') {
exitPlayerToHubOrPairing();
}
}
function spawnReaction(emoji, sender) {
if (!reactionsLayer) return;
var el = document.createElement('div');
el.className = 'tv-reaction';
el.style.left = Math.floor(12 + Math.random() * 75) + '%';
el.innerHTML = emoji + '<span>' + escapeHtml(sender || '') + '</span>';
reactionsLayer.appendChild(el);
setTimeout(function () {
el.style.bottom = '170px';
el.style.opacity = '0';
}, 40);
setTimeout(function () {
if (el.parentNode) el.parentNode.removeChild(el);
}, 2500);
}
