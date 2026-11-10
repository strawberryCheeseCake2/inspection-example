import heart from './heart.js?raw'
import sand from './sand.js?raw'
import heartTrace from './heart.trace.js?raw'
import sandTrace from './sand.trace.js?raw'

export const sketches = [
  {
    id: 'heart',
    name: '하트 브러시',
    file: 'heart-brush.js',
    source: heart,
    debugSource: heartTrace,
    concern: '드래그로 찍은 하트가 두 개 이상 겹치면 하나의 큰 하트로 합치고 싶어.',
    hint: '라이브에서 드래그해 그리기',
  },
  {
    id: 'sand',
    name: '모래 · 물 · 나무',
    file: 'falling-sand.js',
    source: sand,
    debugSource: sandTrace,
    concern: '나무 셀 주변에 물이 많으면 침수되게 하고 싶어.',
    hint: '라이브에서 그리기 · 1 모래, 2 물, 3 씨앗',
  },
]
