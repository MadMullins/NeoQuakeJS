import './style.css';

const viewport = document.querySelector('#viewport-frame');
const status = document.querySelector('#engine-status');
const ioq3 = window.ioq3;

function showStatus(message, isError = false) {
  status.textContent = message;
  status.hidden = false;
  status.classList.toggle('error', isError);
}

function getQueryCommands() {
  const args = [];
  const query = window.location.search.substring(1);
  const search = /([^&=]+)/g;
  let match;

  while ((match = search.exec(query))) {
    try {
      const value = decodeURIComponent(match[1]).replace(/\+/g, ' ');
      const tokens = value.trim().split(/\s+/).filter(Boolean);
      if (tokens.length === 0) continue;
      tokens[0] = `+${tokens[0]}`;
      args.push(...tokens);
    } catch {
      showStatus('Invalid launch command in URL.', true);
      return [];
    }
  }

  return args;
}

function resizeViewport() {
  if (!ioq3.canvas) return;

  const fullscreenElement = document.fullscreenElement
    || document.webkitFullscreenElement
    || document.mozFullScreenElement
    || document.webkitFullScreenElement;

  if (!fullscreenElement) {
    ioq3.setCanvasSize(viewport.offsetWidth, viewport.offsetHeight);
  }
}

if (!ioq3 || typeof ioq3.callMain !== 'function') {
  showStatus('The QuakeJS engine bundle did not load.', true);
} else {
  ioq3.viewport = viewport;
  ioq3.elementPointerLock = true;
  window.addEventListener('resize', resizeViewport);

  const configuredPublicUrl = import.meta.env.VITE_PUBLIC_URL;
  const contentServer = configuredPublicUrl
    ? new URL(configuredPublicUrl).host
    : `${window.location.hostname}:9000`;
  const args = ['+set', 'fs_cdn', contentServer, ...getQueryCommands()];

  try {
    showStatus('Starting QuakeJS...');
    ioq3.callMain(args);
    window.setTimeout(() => {
      status.hidden = true;
    }, 1500);
  } catch (error) {
    console.error('QuakeJS failed to start:', error);
    showStatus('QuakeJS failed to start. See the browser console for details.', true);
  }
}

window.addEventListener('error', (event) => {
  console.error('QuakeJS runtime error:', event.error || event.message);
  showStatus('QuakeJS encountered a runtime error. See the browser console for details.', true);
});
