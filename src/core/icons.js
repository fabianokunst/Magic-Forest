// Icones SVG do HUD e das telas (sem arquivos de imagem).
const svg = (body, cls = 'icon') => `<svg class="${cls}" viewBox="0 0 24 24">${body}</svg>`;

export const ICONS = {
  fire: svg('<path d="M12 2c1 4 5 5.5 5 10.5A5 5 0 0 1 7 12.5C7 10 8.5 8.6 9.5 7.5c.2 2 1 3 2 3.2C11 8 11.5 5 12 2z" fill="#ff9a3c"/><path d="M12 13c.6 1.8 2.2 2.4 2.2 4.4a2.2 2.2 0 0 1-4.4 0c0-1.2.9-1.8 1.4-2.4.1.8.4 1.2.8 1.3-.2-1.2 0-2.3 0-3.3z" fill="#ffe08a"/>'),
  moon: svg('<path d="M15 3a9 9 0 1 0 6 15.5A8 8 0 0 1 15 3z" fill="#cfd8ff"/>', 'icon small'),
  sun: svg('<circle cx="12" cy="12" r="5" fill="#ffc46b"/><g stroke="#ffc46b" stroke-width="2" stroke-linecap="round"><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/></g>', 'icon small'),
  sunrise: svg('<path d="M5 17a7 7 0 0 1 14 0z" fill="#ffb35a"/><g stroke="#ffb35a" stroke-width="2" stroke-linecap="round"><path d="M12 4v3M4.2 8.2l2 2M19.8 8.2l-2 2M2 20h20"/></g>', 'icon small'),
  sunset: svg('<path d="M5 17a7 7 0 0 1 14 0z" fill="#ff7a4a"/><g stroke="#ff7a4a" stroke-width="2" stroke-linecap="round"><path d="M2 20h20M12 4v4M9.5 6.5 12 9l2.5-2.5"/></g>', 'icon small'),
  butterfly: svg('<path d="M12 7c-1.5-3-6-5-8-3s.5 6 3.5 6.5C4 11.5 3.5 15 5.5 16.5S10.5 15 12 12c1.5 3 4.5 6 6.5 4.5S20 11.5 16.5 10.5C19.5 10 22 6 20 4s-6.5 0-8 3z" fill="#ffb3e0"/><path d="M12 6.5v11" stroke="#5a3a6a" stroke-width="1.6" stroke-linecap="round"/><circle cx="8" cy="7.5" r="1.3" fill="#fff6b0"/><circle cx="16" cy="7.5" r="1.3" fill="#fff6b0"/>'),
  mushroom: svg('<path d="M3 12a9 7 0 0 1 18 0c0 1-1 1.5-2 1.5H5c-1 0-2-.5-2-1.5z" fill="#ff6b8a"/><circle cx="8.5" cy="9" r="1.5" fill="#fff"/><circle cx="14" cy="7" r="1.2" fill="#fff"/><circle cx="16.5" cy="10.5" r="1" fill="#fff"/><path d="M9.5 13.5h5l.7 6.5a1.5 1.5 0 0 1-1.5 1.5h-3.4A1.5 1.5 0 0 1 8.8 20z" fill="#fff1d6"/>'),
  shadow: svg('<circle cx="12" cy="13" r="8" fill="#2a1840"/><circle cx="8" cy="9" r="5" fill="#2a1840"/><circle cx="16" cy="10" r="5" fill="#2a1840"/><circle cx="9.5" cy="12" r="1.6" fill="#ff5ad8"/><circle cx="14.5" cy="12" r="1.6" fill="#ff5ad8"/>'),
  lock: svg('<rect x="5" y="10" width="14" height="11" rx="2.5" fill="#9aa3c7"/><path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="#9aa3c7" stroke-width="2.4" fill="none"/>', 'icon small'),
};
