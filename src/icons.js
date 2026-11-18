// Original 24px stroke icons, distributed under Editwell's MIT licence.
const paths = {
 bold:'M7 4h6a4 4 0 0 1 0 8H7m0-8v16h7a4 4 0 0 0 0-8H7',
 italic:'M10 4h8M6 20h8M14 4 10 20',
 underline:'M6 4v7a6 6 0 0 0 12 0V4M4 21h16',
 strike:'M5 12h14M17 6c-4-4-11-2-10 3m0 7c2 5 12 5 11-1',
 paragraph:'M14 4v17M18 4v17M18 4H9a5 5 0 0 0 0 10h5',
 heading:'M5 4v16M16 4v16M5 12h11',
 bulletList:'M9 6h12M9 12h12M9 18h12M3 6h1M3 12h1M3 18h1',
 orderedList:'M10 6h11M10 12h11M10 18h11M3 4h2v5M3 13c3-2 4 1 1 3l-1 2h3',
 quote:'M5 6h5v7H5V6m0 7c0 4 1 5 4 5M14 6h5v7h-5V6m0 7c0 4 1 5 4 5',
 code:'m8 7-5 5 5 5m8-10 5 5-5 5M14 4l-4 16',
 link:'m9 15 6-6M9 8l3-3a5 5 0 0 1 7 7l-3 3M8 9l-3 3a5 5 0 0 0 7 7l3-3',
 undo:'m8 4-5 5 5 5M3 9h11a6 6 0 0 1 0 12',
 redo:'m16 4 5 5-5 5M21 9H10a6 6 0 0 0 0 12',
 source:'m8 6-6 6 6 6m8-12 6 6-6 6M14 3l-4 18',
 table:'M3 3h18v18H3V3m0 6h18M3 15h18M9 3v18M15 3v18',
 image:'M3 3h18v18H3V3m0 14 6-6 5 5 3-3 4 4M16 7h1',
 imageDetails:'M3 3h18v18H3V3M12 10v7M12 6v1',
 callout:'M3 3h18v18H3V3M12 7v6M12 16v1',
 find:'M15 15l6 6M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0',
 clear:'m4 14 9-10 8 7-9 10H9l-5-7m4-4 8 7M14 21h8',
 toc:'M3 5h18M3 12h18M3 19h18',
 internalLink:'M3 3h7v18H3V3M14 3h7v18h-7V3M6 7h1M17 7h1',
 plainPaste:'M8 4H4v17h16V4h-4M8 2h8v5H8V2M8 11h8M8 16h8',
}
export function icon(id) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  for (const [name, value] of Object.entries({ viewBox:'0 0 24 24', width:20, height:20, fill:'none', stroke:'currentColor', 'stroke-width':1.7, 'stroke-linecap':'round', 'stroke-linejoin':'round', 'aria-hidden':'true' })) svg.setAttribute(name, value)
  const path = document.createElementNS(svg.namespaceURI, 'path')
  path.setAttribute('d', paths[id] ?? paths.table)
  svg.append(path)
  return svg
}
