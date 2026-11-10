import React from 'react'

const paths = {
  logo: 'M3 12h4l3-7 4 14 3-7h4',
  run: 'm8 5 12 7-12 7V5Z',
  pause: 'M9 5v14m6-14v14',
  left: 'm14 6-6 6 6 6',
  right: 'm10 6 6 6-6 6',
  spark: 'M12 2v5m0 10v5M2 12h5m10 0h5M7 12a5 5 0 0 0 5-5 5 5 0 0 0 5 5 5 5 0 0 0-5 5 5 5 0 0 0-5-5Z',
  code: 'm8 6-6 6 6 6m8-12 6 6-6 6m-3-16-2 20',
  eye: 'M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
  sliders: 'M5 4v7m0 4v5m7-16v3m0 4v9m7-16v11m0 4v1M2 11h6v4H2zm7-4h6v4H9zm7 8h6v4h-6z',
}

export function Icon({ name, size = 17 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={paths[name]} />
  </svg>
}
