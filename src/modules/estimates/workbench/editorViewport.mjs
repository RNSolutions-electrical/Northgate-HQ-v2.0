// CSS width queries use the layout viewport, even while its visible area
// shrinks for a soft keyboard or pinch zoom. Do not resize the nested editor
// on those changes on narrow screens: that also resizes every dialog in it.
export const NARROW_ESTIMATE_EDITOR='(max-width: 768px)';

export function estimateEditorHeight({ layoutHeight, visualHeight, top, bottom, narrow }) {
 const viewportHeight=narrow?layoutHeight:(visualHeight||layoutHeight);
 return Math.max(1,viewportHeight-top-bottom-16);
}
