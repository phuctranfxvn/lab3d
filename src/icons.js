const s = (body) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const icons = {
  logo: `<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M3.5 6.5 Q16 13 28.5 6.5 L28.5 10.5 Q16 17 3.5 10.5Z" fill="#e8312f" stroke="#0f3557" stroke-width="1.6" stroke-linejoin="round"/><circle cx="16" cy="20.5" r="9" fill="#ffc928" stroke="#0f3557" stroke-width="1.8"/><path d="M7.6 17.2 Q16 20 24.4 17.2M7.3 19.6 Q16 22.4 24.7 19.6" stroke="#0f3557" stroke-width="1.5" fill="none" stroke-linecap="round"/><circle cx="16" cy="24" r="1.7" fill="#0f3557"/><path d="M16 25.2V28.6" stroke="#0f3557" stroke-width="1.6" stroke-linecap="round"/><circle cx="12.3" cy="15.4" r="1.4" fill="#fff" opacity=".8"/></svg>`,
  bell: `<svg viewBox="2 4 28 27" aria-hidden="true"><path d="M3.5 6.5 Q16 13 28.5 6.5 L28.5 10.5 Q16 17 3.5 10.5Z" fill="#e8312f" stroke="#0f3557" stroke-width="1.6" stroke-linejoin="round"/><circle cx="16" cy="20.5" r="9" fill="#ffc928" stroke="#0f3557" stroke-width="1.8"/><path d="M7.6 17.2 Q16 20 24.4 17.2M7.3 19.6 Q16 22.4 24.7 19.6" stroke="#0f3557" stroke-width="1.5" fill="none" stroke-linecap="round"/><circle cx="16" cy="24" r="1.7" fill="#0f3557"/><path d="M16 25.2V28.6" stroke="#0f3557" stroke-width="1.6" stroke-linecap="round"/><circle cx="12.3" cy="15.4" r="1.4" fill="#fff" opacity=".8"/></svg>`,
  pocket: `<svg viewBox="0 0 340 280" aria-hidden="true" class="pocket-art">
    <circle cx="170" cy="150" r="128" fill="var(--blue)" opacity=".16"/>
    <g class="pop pop-1"><g transform="translate(78 40) rotate(-12)">
      <path d="M40 4 76 22v40L40 80 4 62V22z" fill="var(--blue)" stroke="var(--ink)" stroke-width="5" stroke-linejoin="round"/>
      <path d="M40 42 76 22M40 42 4 22M40 42v38" stroke="var(--ink)" stroke-width="5" fill="none" stroke-linejoin="round"/>
      <path d="M40 4 76 22 40 42 4 22z" fill="#fff" opacity=".35"/>
    </g></g>
    <g class="pop pop-2"><g transform="translate(206 26) rotate(10)">
      <rect x="0" y="0" width="54" height="86" rx="6" fill="#f490b4" stroke="var(--ink)" stroke-width="5"/>
      <rect x="9" y="10" width="36" height="66" rx="3" fill="none" stroke="var(--ink)" stroke-width="3" opacity=".35"/>
      <circle cx="42" cy="46" r="4.5" fill="#ffc928" stroke="var(--ink)" stroke-width="3"/>
    </g></g>
    <g class="pop pop-3"><g transform="translate(150 6) scale(2.1)"><path d="M3.5 6.5 Q16 13 28.5 6.5 L28.5 10.5 Q16 17 3.5 10.5Z" fill="#e8312f" stroke="#0f3557" stroke-width="1.6" stroke-linejoin="round"/><circle cx="16" cy="20.5" r="9" fill="#ffc928" stroke="#0f3557" stroke-width="1.8"/><path d="M7.6 17.2 Q16 20 24.4 17.2M7.3 19.6 Q16 22.4 24.7 19.6" stroke="#0f3557" stroke-width="1.5" fill="none" stroke-linecap="round"/><circle cx="16" cy="24" r="1.7" fill="#0f3557"/><path d="M16 25.2V28.6" stroke="#0f3557" stroke-width="1.6" stroke-linecap="round"/><circle cx="12.3" cy="15.4" r="1.4" fill="#fff" opacity=".8"/></g></g>
    <g class="pop pop-4" fill="#ffc928" stroke="var(--ink)" stroke-width="4" stroke-linejoin="round">
      <path d="M58 118l6 13 14 2-10 10 2 14-12-7-12 7 2-14-10-10 14-2z"/>
    </g>
    <g stroke="var(--ink)" stroke-width="4" stroke-linecap="round" class="sparkle">
      <path d="M290 70v16M282 78h16M40 64v12M34 70h12M300 132v10M295 137h10"/>
    </g>
    <path d="M44 150H296A126 126 0 0 1 44 150Z" fill="#fff" stroke="var(--ink)" stroke-width="6" stroke-linejoin="round"/>
    <path d="M60 162H280" stroke="var(--ink)" stroke-width="3" opacity=".12" stroke-linecap="round"/>
  </svg>`,
  cube: s('<path d="M12 2.8 20.5 7.5v9L12 21.2 3.5 16.5v-9z"/><path d="M12 12l8.5-4.5M12 12 3.5 7.5M12 12v9.2"/>'),
  top: s('<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 12h16M12 4v16" opacity=".5"/>'),
  front: s('<rect x="4" y="9" width="16" height="11" rx="1.5"/><path d="M2 20h20"/>'),
  fit: s('<path d="M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4"/><circle cx="12" cy="12" r="3"/>'),
  edges: s('<path d="M12 2.8 20.5 7.5v9L12 21.2 3.5 16.5v-9z" stroke-dasharray="2.5 2.5"/>'),
  layers: s('<path d="M12 3 2.5 8 12 13l9.5-5z"/><path d="M2.5 12.5 12 17.5l9.5-5M2.5 16.5 12 21.5l9.5-5"/>'),
  download: s('<path d="M12 3v12M7 10l5 5 5-5M4 20h16"/>'),
  reset: s('<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/>'),
  link: s('<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3.2-3.2a4.5 4.5 0 0 0-6.4-6.4L12 5.6"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3.2 3.2a4.5 4.5 0 0 0 6.4 6.4l1.2-1.2"/>'),
  back: s('<path d="M15 18l-6-6 6-6"/>'),
  arrow: s('<path d="M5 12h14M13 6l6 6-6 6"/>'),
  chevron: s('<path d="M6 9l6 6 6-6"/>'),
  sliders: s('<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>'),
  check: s('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  alert: s('<path d="M12 3.5 21.5 20h-19z"/><path d="M12 10v4.5M12 17.5v.01"/>'),
  close: s('<path d="M6 6l12 12M18 6 6 18"/>'),
  bolt: s('<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>'),
  folder: s('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'),
};
