// Paper, soft ink and a little breeze. All decoration stays behind image surfaces.
export function ArenaScene({ moving }: { moving: boolean }) {
  return <div className="arena-scene" aria-hidden="true" data-motion={moving ? 'running' : 'paused'}>
    <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" focusable="false">
      <g className="arena-weather">
        <g className="arena-sun"><circle cx="1420" cy="88" r="54" fill="var(--scene-sun)" opacity=".6" />
          <circle cx="1420" cy="88" r="66" fill="none" stroke="var(--scene-sun)" strokeWidth="1" opacity=".35" /></g>
        <path className="arena-moon" d="M1441 36a53 53 0 1 0 31 82 47 47 0 0 1-31-82Z" fill="var(--scene-sun)" opacity=".7" />
        <g className="arena-cloud cloud-near" fill="var(--scene-cloud)"><path d="M44 67q5-19 26-13 8-30 33-15 15-14 29 4 24-1 29 24Z" /></g>
        <g className="arena-cloud cloud-far" fill="var(--scene-cloud)"><path d="M1222 37q8-22 29-14 12-29 36-9 23-8 31 12 20-2 25 11Z" /></g>
      </g>
      <g className="arena-garden" fill="var(--scene-garden)">
        <path d="M0 502V438q55-87 105-3 47-103 99-16 39-73 82-10v93ZM1314 502v-93q43-63 82 10 52-87 99 16 50-84 105 3v64Z" />
        {[false, true].map(flip => <g key={String(flip)} transform={flip ? 'translate(1600 0) scale(-1 1)' : undefined}>
          <path d="M95 521q33-148 24-307l12-2q16 177-17 309Z" fill="var(--scene-stone)" />
          <path d="M126 217q-72-96-136-10 74-38 128 13-98-25-119 62 57-61 119-52-39 37-26 98 18-66 39-94 27 31 40 77 17-59-30-88 62-21 119 17-33-73-118-27 31-67 94-69-88-35-110 62Z" />
        </g>)}
      </g>
      <g className="arena-temple">
        <path d="M212 183h1176v438H212Z" fill="var(--scene-wall)" stroke="var(--scene-line)" strokeWidth="2" />
        <path d="M252 223h1096v310H252Z" fill="var(--scene-wall-light)" />
        <path d="M366 239h868v310H366Z" fill="var(--scene-lattice)" />
        {[414, 524, 634, 744, 854, 964, 1074, 1184].map(x => <path key={x} d={`M${x} 253v278`} stroke="var(--scene-line)" strokeWidth="3" />)}
        <path d="M366 342h868M366 444h868" stroke="var(--scene-line)" strokeWidth="3" />
        {[238, 326, 1256, 1344].map(x => <g key={x}>
          <path d={`M${x} 176h18v408h-18Z`} fill="var(--scene-column)" />
          <path d={`M${x - 7} 571h32v34h-32Z`} fill="var(--scene-stone)" />
          <path d={`M${x - 4} 205h26v9h-26Z`} fill="var(--scene-trim)" />
        </g>)}
        <path d="M182 586h1236v22H182ZM161 608h1278v23H161Z" fill="var(--scene-stone)" stroke="var(--scene-line)" strokeWidth="2" />
        <g className="arena-roof" strokeLinejoin="round">
          <path d="M140 100q90 46 225-15Q605 35 800 1q195 34 435 84 135 61 225 15-22 68-100 92H240q-78-24-100-92Z" fill="var(--scene-roof)" stroke="var(--scene-roof-line)" strokeWidth="3" />
          <path d="M178 137q100 41 220-12L800 36l402 89q120 53 220 12M207 162q100 23 219-10L800 68l374 84q119 33 219 10" fill="none" stroke="var(--scene-roof-light)" strokeWidth="2" />
          {[0, 1, 2, 3, 4, 5, 6].map(i => <g key={i} fill="none" stroke="var(--scene-roof-line)" strokeWidth="2">
            <path d={`M${398 + i * 57} ${83 - i * 11}q-18 57-57 104`} />
            <path d={`M${1202 - i * 57} ${83 - i * 11}q18 57 57 104`} />
          </g>)}
          <path d="M147 105q30 89 111 91h1084q81-2 111-91M264 197h1072" fill="none" stroke="var(--scene-trim)" strokeWidth="8" />
          <path d="M538 174 800 32l262 142-40 32-222-122-222 122Z" fill="var(--scene-roof-light)" stroke="var(--scene-roof-line)" strokeWidth="3" />
          <path d="m603 177 197-101 197 101Z" fill="var(--scene-wall)" stroke="var(--scene-trim)" strokeWidth="4" />
          <path d="M752 146h96v63h-96Z" fill="var(--scene-trim)" stroke="var(--scene-line)" strokeWidth="3" />
          <path d="m800 156 20 21-20 22-20-22Z" fill="none" stroke="var(--scene-line)" strokeWidth="3" />
        </g>
      </g>
      <g className="arena-banners" stroke="var(--scene-line)" strokeWidth="2" strokeLinejoin="round">
        {[false, true].map(flip => <g key={String(flip)} transform={flip ? 'translate(1530 320) scale(-1 1)' : 'translate(70 320)'}>
          <path d="M0-18v262" fill="none" strokeWidth="3" />
          <circle cy="-23" r="5" fill="var(--scene-trim)" />
          <g className="arena-flag"><path d="M0 0q37 10 73 0v114l-36-15L0 114Z" fill="var(--scene-column)" stroke="var(--scene-line)" />
            <path d="M22 40q7-10 15 1 8-11 15-1 8 10-15 28-23-18-15-28Z" fill="none" stroke="var(--scene-line)" />
            <path d="M10 9v92M62 10v91" fill="none" stroke="var(--scene-wall-light)" strokeWidth="1" />
          </g>
        </g>)}
      </g>
      <g className="arena-platform" strokeLinejoin="round">
        <path d="M155 601h1290l179 245v54H-24v-54Z" fill="var(--scene-stone)" stroke="var(--scene-line)" strokeWidth="3" />
        <path d="M155 601h1290l179 245H-24Z" fill="var(--scene-wall)" stroke="var(--scene-line)" strokeWidth="3" />
        <path d="M174 617h1252l147 210H27Z" fill="var(--scene-floor)" stroke="var(--scene-line)" strokeWidth="2" />
        <g fill="none" stroke="var(--scene-line)" strokeWidth="2">
          <path d="M148 651h1304M111 704h1378M69 765h1462M217 827l117-210M450 827l73-210M683 827l24-210M917 827l-24-210M1150 827l-73-210M1383 827l-117-210" />
          <path d="m176 681 20 5 12-7M1220 746l21 9 6-12M546 801l18-10 14 3" opacity=".5" />
        </g>
        <path d="M-10 857h1620M-10 884h1620" fill="none" stroke="var(--scene-line)" strokeWidth="2" />
      </g>
    </svg>
    <div className="arena-breeze">
      {[0, 1, 2].map(i => <div className="breeze-track" key={`wind-${i}`}>
        <svg viewBox="0 0 180 65" focusable="false"><path d="M4 28h102c34 0 35-25 17-25-10 0-14 8-9 13M37 40h118c26 0 27 20 13 20-8 0-11-6-7-10M13 51h55" /></svg>
      </div>)}
      {[0, 1, 2, 3].map(i => <div className="drifting-leaf" key={`leaf-${i}`}>
        <svg viewBox="0 0 32 24" focusable="false"><path d="M3 19C0 6 15 0 29 3 28 16 16 23 3 19Z" /><path d="M1 22 24 6M9 15l-2-5m9-1 2 5" fill="none" /></svg>
      </div>)}
    </div>
  </div>;
}
