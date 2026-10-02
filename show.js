(() => {
  const body = document.body;
  const invitation = document.getElementById('openShow');
  const invitationLabel = document.getElementById('showButtonLabel');
  const stage = document.getElementById('showStage');
  const controls = document.getElementById('showControls');
  const music = document.getElementById('showMusic');
  const lyrics = document.getElementById('showLyrics');
  const lyricLine = document.getElementById('showLyricLine');
  const playerContainer = document.getElementById('showAudioPlayer');
  const musicHint = document.getElementById('showMusicHint');
  const video = document.getElementById('showVideo');
  const videoPlaceholder = document.getElementById('showVideoPlaceholder');
  const status = document.getElementById('showStatus');
  const playButton = document.getElementById('toggleShow');
  const playIcon = document.getElementById('showPlayIcon');
  const playLabel = document.getElementById('showPlayLabel');
  const restartButton = document.getElementById('restartShow');
  const softenButton = document.getElementById('softenShow');
  const seek = document.getElementById('showSeek');
  const currentTimeLabel = document.getElementById('showCurrentTime');
  const durationLabel = document.getElementById('showDuration');
  const canvas = document.getElementById('showParticles');
  const context = canvas.getContext('2d');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  // The local song drives amplitude analysis and a 95 BPM choreography.
  // Playback position keeps the effects aligned after pauses and seeks.
  const BEAT_SECONDS = 60 / 95;
  const scenes = [
    { at: 0, rgb: '185, 140, 242', secondary: '240, 185, 221', energy: .28, name: 'estrelas' },
    { at: 22, rgb: '217, 162, 240', secondary: '128, 116, 230', energy: .42, name: 'encontro' },
    { at: 48, rgb: '240, 153, 198', secondary: '232, 200, 119', energy: .64, name: 'florescer' },
    { at: 74, rgb: '232, 200, 119', secondary: '240, 153, 198', energy: .94, name: 'universo' },
    { at: 104, rgb: '164, 154, 242', secondary: '217, 194, 251', energy: .4, name: 'abraco' },
    { at: 132, rgb: '240, 153, 198', secondary: '232, 200, 119', energy: 1, name: 'infinito' },
    { at: 176, rgb: '232, 200, 119', secondary: '185, 140, 242', energy: .58, name: 'promessa' },
    { at: 202, rgb: '217, 194, 251', secondary: '240, 185, 221', energy: .22, name: 'amor' }
  ];
  const particles = Array.from({ length: 100 }, (_, index) => ({
    x: ((index * 73 + 19) % 101) / 101, offset: ((index * 37) % 103) / 103,
    speed: .45 + ((index * 11) % 17) / 17, size: 2 + ((index * 7) % 14),
    sway: index * 2.399, heart: index % 4 === 0
  }));
  let active = false;
  let playing = false;
  let ready = false;
  let softened = reducedMotion.matches;
  let player = null;
  let frame = 0;
  let playerTimeout = 0;
  let generation = 0;
  let sceneIndex = -1;
  let highlightIndex = -1;
  let lastTime = 0;
  let duration = 212;
  let seekPreview = null;
  let width = 0;
  let height = 0;
  let photos = [];
  let audioContext = null;
  let analyser = null;
  let waveData = null;
  let lyricCues = [];
  let lyricIndex = -1;
  let lyricOffset = 0;

  function prepareLyrics() {
    const config = window.SHOW_LYRICS || {};
    const lrc = typeof config.lrc === 'string' ? config.lrc : '';
    const metadataOffset = lrc.match(/\[offset:\s*([+-]?\d+)\s*\]/i);
    lyricOffset = (Number(config.offset) || 0) + (metadataOffset ? Number(metadataOffset[1]) / 1000 : 0);
    lyricCues = [];
    for (const line of lrc.split(/\r?\n/)) {
      const times = Array.from(line.matchAll(/\[(\d+):([0-5]?\d(?:\.\d+)?)\]/g));
      if (!times.length) continue;
      const text = line.replace(/\[[^\]]*\]/g, '').trim();
      for (const timestamp of times) {
        lyricCues.push({ at: Number(timestamp[1]) * 60 + Number(timestamp[2]), text });
      }
    }
    lyricCues.sort((a, b) => a.at - b.at);
    clearLyrics();
    positionLyrics();
  }

  function positionLyrics() {
    if (active) lyrics.style.setProperty('--lyrics-controls-height', `${controls.getBoundingClientRect().height}px`);
  }

  function clearLyrics() {
    lyricIndex = -1;
    lyrics.hidden = true;
    lyrics.style.opacity = '';
    lyricLine.replaceChildren();
  }

  function renderLyrics(time) {
    lyrics.classList.toggle('is-still', !playing || softened || reducedMotion.matches);
    const position = time - lyricOffset;
    let index = -1;
    for (let next = 0; next < lyricCues.length && lyricCues[next].at <= position; next++) index = next;
    const cue = lyricCues[index];
    // Blank cues and long instrumental gaps leave the page unobstructed.
    const end = cue ? Math.min(lyricCues[index + 1]?.at ?? duration, cue.at + 9) : 0;
    if (!cue?.text || position >= end) {
      lyrics.hidden = true;
      lyricIndex = -1;
      return;
    }
    if (index !== lyricIndex) {
      lyricIndex = index;
      const verseNumber = lyricCues.slice(0, index).filter(item => item.text).length;
      lyrics.dataset.side = verseNumber % 2 ? 'right' : 'left';
      lyricLine.replaceChildren();
      cue.text.split(/\s+/).forEach((word, wordIndex) => {
        if (wordIndex) lyricLine.appendChild(document.createTextNode(' '));
        const span = document.createElement('span');
        span.textContent = word;
        span.style.setProperty('--word-delay', `${Math.min(wordIndex * 35, 280)}ms`);
        lyricLine.appendChild(span);
      });
    }
    lyrics.hidden = false;
    lyrics.style.opacity = String(Math.min(1, Math.max(0, (end - position) / .5)));
  }

  function timeLabel(seconds) {
    const value = Math.max(0, Math.floor(seconds));
    return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
  }

  function resizeCanvas() {
    width = document.documentElement.clientWidth;
    height = window.innerHeight;
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    if (context) context.setTransform(ratio, 0, 0, ratio, 0, 0);
    if (active) { positionLyrics(); renderAt(lastTime); }
  }

  function drawHeart(x, y, size, rotation, alpha, rgb) {
    if (!context) return;
    context.save(); context.translate(x, y); context.rotate(rotation); context.scale(size, size);
    context.beginPath(); context.moveTo(0, .35);
    context.bezierCurveTo(-1.4, -.45, -.8, -1.3, 0, -.65);
    context.bezierCurveTo(.8, -1.3, 1.4, -.45, 0, .35);
    context.strokeStyle = `rgba(${rgb}, ${alpha})`; context.lineWidth = 1 / size;
    context.stroke(); context.restore();
  }

  function drawParticles(time, scene, pulse) {
    if (!context) return;
    context.clearRect(0, 0, width, height);
    if (reducedMotion.matches) return;
    const amount = width < 600 ? 50 : particles.length;
    const intensity = softened ? .35 : 1;
    for (let index = 0; index < amount; index++) {
      const particle = particles[index];
      const travel = (time * .022 * particle.speed + particle.offset) % 1;
      const x = particle.x * width + Math.sin(time * .22 + particle.sway) * 32;
      const y = height * (1 - travel);
      const alpha = Math.sin(travel * Math.PI) * (.2 + scene.energy * .36 + pulse * .1) * intensity;
      if (particle.heart) {
        drawHeart(x, y, particle.size, Math.sin(time * .3 + particle.sway) * .3, alpha, scene.secondary);
      } else {
        context.beginPath(); context.arc(x, y, particle.size * .16, 0, Math.PI * 2);
        context.fillStyle = `rgba(${scene.rgb}, ${alpha})`; context.fill();
      }
    }
    // Soft blossoms on eight-beat phrases in the brighter scenes.
    const phrase = BEAT_SECONDS * 8;
    const age = time % phrase;
    if (scene.energy < .6 || age > 3 || softened) return;
    const phraseNumber = Math.floor(time / phrase);
    const originX = width * (phraseNumber % 2 ? .78 : .22);
    const originY = height * (.3 + (phraseNumber % 3) * .2);
    for (let index = 0; index < 18; index++) {
      const angle = index * Math.PI * 2 / 18 + phraseNumber;
      const distance = age * (28 + index % 3 * 10);
      drawHeart(originX + Math.cos(angle) * distance, originY + Math.sin(angle) * distance - age * 13,
        4 + age * 2, angle * .2, (1 - age / 3) * .45, scene.rgb);
    }
  }

  function setScene(index) {
    if (sceneIndex === index) return;
    sceneIndex = index;
    const scene = scenes[index];
    body.style.setProperty('--show-rgb', scene.rgb);
    body.style.setProperty('--show-secondary-rgb', scene.secondary);
    body.dataset.showScene = scene.name;
  }

  function renderAt(time) {
    lastTime = Math.max(0, Number.isFinite(time) ? time : 0);
    let index = 0;
    for (let next = 1; next < scenes.length && lastTime >= scenes[next].at; next++) index = next;
    setScene(index);
    const scene = scenes[index];
    const motion = reducedMotion.matches ? 0 : (softened ? .35 : 1);
    const beatPhase = lastTime / BEAT_SECONDS;
    const gridPulse = Math.pow((1 + Math.cos(beatPhase * Math.PI * 2)) / 2, 4);
    let audioPulse = 0;
    if (analyser && waveData && playing) {
      analyser.getByteTimeDomainData(waveData);
      let sum = 0;
      for (let sample = 0; sample < waveData.length; sample += 4) {
        sum += Math.pow((waveData[sample] - 128) / 128, 2);
      }
      audioPulse = Math.min(1, Math.sqrt(sum / (waveData.length / 4)) * 3.5);
    }
    const pulse = (analyser ? Math.min(1, audioPulse * .75 + gridPulse * .25) : gridPulse) * motion;
    const swell = (1 + Math.sin(lastTime * Math.PI / (BEAT_SECONDS * 8))) / 2;
    body.style.setProperty('--show-beat', pulse.toFixed(3));
    body.style.setProperty('--show-energy', (scene.energy * (softened ? .5 : 1)).toFixed(3));
    body.style.setProperty('--show-swell', (swell * motion).toFixed(3));
    body.style.setProperty('--show-orbit', `${(reducedMotion.matches ? 0 : lastTime * .8).toFixed(2)}deg`);
    body.style.setProperty('--show-beam-a', `${(-24 + Math.sin(lastTime * .23) * 26 * motion).toFixed(2)}deg`);
    body.style.setProperty('--show-beam-b', `${(20 + Math.sin(lastTime * .17 + 2) * 30 * motion).toFixed(2)}deg`);
    body.style.setProperty('--show-beam-c', `${(Math.cos(lastTime * .2) * 24 * motion).toFixed(2)}deg`);
    body.style.setProperty('--show-progress', `${Math.min(100, lastTime / duration * 100).toFixed(2)}%`);
    currentTimeLabel.textContent = timeLabel(lastTime);
    seek.setAttribute('aria-valuetext', `${timeLabel(lastTime)} de ${timeLabel(duration)}`);
    if (seekPreview === null) seek.value = String(lastTime);
    const nextHighlight = reducedMotion.matches || softened ? -1 : Math.floor(beatPhase / 8) % Math.max(1, photos.length);
    if (nextHighlight !== highlightIndex) {
      photos[highlightIndex]?.classList.remove('show-highlight');
      photos[nextHighlight]?.classList.add('show-highlight');
      highlightIndex = nextHighlight;
    }
    drawParticles(lastTime, scene, pulse);
    renderLyrics(lastTime);
  }

  function stopFrames() { window.cancelAnimationFrame(frame); frame = 0; }
  function syncVideo() {
    if (!active || video.hidden || video.readyState < 1 || video.error) return;
    const time = Math.min(player?.getCurrentTime() || 0, video.duration);
    if (Math.abs(video.currentTime - time) > .35) video.currentTime = time;
    if (playing && time < video.duration) {
      if (video.paused) video.play().catch(() => {});
    } else {
      video.pause();
    }
  }
  function tick() {
    frame = 0;
    if (!active || !playing || document.hidden) return;
    renderAt(seekPreview ?? player?.getCurrentTime?.() ?? lastTime);
    frame = window.requestAnimationFrame(tick);
  }
  function startFrames() {
    stopFrames();
    if (active && playing && !document.hidden) frame = window.requestAnimationFrame(tick);
  }
  function setStatus(text, hint) {
    status.textContent = text;
    if (hint !== undefined) {
      musicHint.textContent = hint;
      musicHint.hidden = !hint;
    }
  }
  function updatePlaybackButtons() {
    const label = playing ? 'Pausar música e luzes' : 'Continuar música e luzes';
    playButton.setAttribute('aria-label', label); playButton.title = label;
    playIcon.textContent = playing ? 'Ⅱ' : '▶'; playLabel.textContent = playing ? 'pausar' : 'tocar';
    body.classList.toggle('show-paused', !playing);
  }

  function handleState(event, token) {
    if (!active || token !== generation) return;
    playing = event.data === 1;
    syncVideo();
    updatePlaybackButtons();
    if (playing) {
      duration = player.getDuration() || duration;
      seek.max = String(duration); durationLabel.textContent = timeLabel(duration);
      setStatus('♡', '');
      startFrames();
    } else {
      stopFrames();
      if (ready) renderAt(player.getCurrentTime() || 0);
      if (event.data === 2) setStatus('música e luzes pausadas', '');
      if (event.data === 3) setStatus('carregando a música…', 'as luzes continuam assim que a música voltar.');
      if (event.data === 0) {
        clearLyrics();
        setScene(scenes.length - 1);
        setStatus('meu amor continua ♡', 'toque em recomeçar para viver esse momento de novo.');
        playButton.setAttribute('aria-label', 'Recomeçar música e show');
      }
    }
  }

  function loadMusic() {
    const token = ++generation;
    ready = false; playing = false;
    playButton.disabled = true; restartButton.disabled = true; seek.disabled = true;
    stopFrames(); updatePlaybackButtons();
    window.clearTimeout(playerTimeout);
    player?.destroy(); player = null; playerContainer.replaceChildren();
    setStatus('preparando a música…', 'preparando a nossa música…');

    const audio = document.createElement('audio');
    audio.hidden = true;
    audio.preload = 'auto';
    audio.setAttribute('aria-label', 'Sailor Song');
    audio.src = 'musica.mp3';
    playerContainer.appendChild(audio);
    let disposed = false;
    let mediaSource = null;
    const valid = () => active && token === generation && !disposed;
    const play = () => {
      if (!valid()) return;
      audioContext?.resume().catch(() => {});
      // Start the muted video from the same click that authorizes the music.
      if (!video.hidden && !video.error) video.play().catch(() => {});
      audio.play().catch(error => {
        if (!valid()) return;
        if (error.name === 'NotAllowedError') {
          playing = false; stopFrames(); updatePlaybackButtons();
          video.pause();
          setStatus('toque no play para começar', 'toque no play para ouvir a música e acender as luzes.');
        }
      });
    };
    player = {
      getCurrentTime: () => audio.currentTime || 0,
      getDuration: () => Number.isFinite(audio.duration) ? audio.duration : duration,
      play,
      pause: () => audio.pause(),
      seekTo: time => { audio.currentTime = time; },
      destroy: () => {
        disposed = true; audio.pause(); audio.removeAttribute('src'); audio.load();
        mediaSource?.disconnect(); analyser?.disconnect(); analyser = null; waveData = null;
        audio.remove();
      }
    };
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      // Local file URLs can silence a media element routed through Web Audio.
      // In that case, keep native playback and the choreography tied to its clock.
      if (AudioContextClass && window.location.protocol !== 'file:') {
        audioContext ||= new AudioContextClass();
        mediaSource = audioContext.createMediaElementSource(audio);
        analyser = audioContext.createAnalyser(); analyser.fftSize = 512;
        waveData = new Uint8Array(analyser.fftSize);
        mediaSource.connect(analyser); analyser.connect(audioContext.destination);
      }
    } catch {
      analyser = null; waveData = null;
      if (mediaSource && audioContext) mediaSource.connect(audioContext.destination);
    }
    function unavailable() {
      if (!valid()) return;
      window.clearTimeout(playerTimeout);
      playing = false; ready = false; stopFrames(); updatePlaybackButtons();
      video.pause();
      playButton.disabled = true; seek.disabled = true; restartButton.disabled = false;
      setStatus('não consegui carregar a música', 'toque em recomeçar para tentar carregar a música de novo.');
    }
    audio.addEventListener('loadedmetadata', () => {
      if (!valid()) return;
      window.clearTimeout(playerTimeout); ready = true;
      duration = player.getDuration(); seek.max = String(duration);
      durationLabel.textContent = timeLabel(duration);
      playButton.disabled = false; restartButton.disabled = false; seek.disabled = false;
      setStatus('dê play para começar ♡', 'toque no play para ouvir a música com as luzes.');
    });
    audio.addEventListener('playing', () => { if (valid()) handleState({ data: 1 }, token); });
    audio.addEventListener('pause', () => { if (valid() && !audio.ended) handleState({ data: 2 }, token); });
    audio.addEventListener('waiting', () => { if (valid()) handleState({ data: 3 }, token); });
    audio.addEventListener('ended', () => { if (valid()) handleState({ data: 0 }, token); });
    audio.addEventListener('seeking', () => { if (valid()) { stopFrames(); syncVideo(); renderAt(audio.currentTime); } });
    audio.addEventListener('seeked', () => { if (valid()) handleState({ data: audio.paused ? 2 : 1 }, token); });
    audio.addEventListener('error', unavailable);
    audio.addEventListener('timeupdate', () => { if (valid()) syncVideo(); });
    playerTimeout = window.setTimeout(unavailable, 15000);
    play();
  }
  function startShow() {
    active = true; sceneIndex = -1; lastTime = 0; duration = 212; seekPreview = null;
    seek.max = '212'; durationLabel.textContent = '3:32';
    softened = reducedMotion.matches; softenButton.setAttribute('aria-pressed', String(softened));
    photos = Array.from(document.querySelectorAll('.photo-frame'));
    body.classList.add('show-active');
    stage.hidden = false; canvas.hidden = false; controls.hidden = false; music.hidden = false;
    prepareLyrics();
    const hasVideo = Boolean(video.getAttribute('src') || video.querySelector('source[src]'));
    video.hidden = !hasVideo; videoPlaceholder.hidden = hasVideo;
    video.muted = true;
    if (video.readyState >= 1) video.currentTime = 0;
    invitation.setAttribute('aria-pressed', 'true'); invitationLabel.textContent = 'encerrar o show';
    resizeCanvas(); loadMusic();
  }
  function endShow() {
    active = false; playing = false; ready = false; generation++;
    stopFrames(); window.clearTimeout(playerTimeout);
    player?.destroy?.(); player = null; playerContainer.replaceChildren();
    video.pause();
    clearLyrics();
    audioContext?.suspend().catch(() => {});
    photos.forEach(photo => photo.classList.remove('show-highlight')); highlightIndex = -1;
    body.classList.remove('show-active', 'show-paused'); delete body.dataset.showScene;
    for (const property of Array.from(body.style)) {
      if (property.startsWith('--show-')) body.style.removeProperty(property);
    }
    stage.hidden = true; canvas.hidden = true; controls.hidden = true; music.hidden = true;
    if (context) context.clearRect(0, 0, width, height);
    invitation.setAttribute('aria-pressed', 'false'); invitationLabel.textContent = 'um show só pra você';
    invitation.focus({ preventScroll: true });
  }

  invitation.addEventListener('click', () => active ? endShow() : startShow());
  document.getElementById('closeShow').addEventListener('click', endShow);
  playButton.addEventListener('click', () => {
    if (!ready) return;
    if (playing) player.pause(); else player.play();
  });
  restartButton.addEventListener('click', () => {
    seekPreview = null; sceneIndex = -1; renderAt(0);
    if (!ready) loadMusic();
    else { player.seekTo(0); player.play(); }
  });
  softenButton.addEventListener('click', () => {
    softened = !softened; softenButton.setAttribute('aria-pressed', String(softened)); renderAt(lastTime);
  });
  seek.addEventListener('input', () => { seekPreview = Number(seek.value); renderAt(seekPreview); });
  seek.addEventListener('change', () => {
    const destination = Number(seek.value);
    if (ready) player.seekTo(destination);
    seekPreview = null; renderAt(destination);
  });
  seek.addEventListener('blur', () => { seekPreview = null; });
  window.addEventListener('resize', resizeCanvas);
  video.addEventListener('loadedmetadata', syncVideo);
  video.addEventListener('canplay', syncVideo);
  if (window.ResizeObserver) new ResizeObserver(positionLyrics).observe(controls);
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopFrames(); else startFrames(); });
  document.addEventListener('keydown', event => { if (active && event.key === 'Escape') endShow(); });
  reducedMotion.addEventListener('change', event => {
    if (!active) return;
    softened = event.matches; softenButton.setAttribute('aria-pressed', String(softened)); renderAt(lastTime);
  });
})();
