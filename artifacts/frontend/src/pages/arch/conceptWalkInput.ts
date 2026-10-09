export function walkDirection(keyboard: Iterable<string>, pointers: Iterable<string>) {
  const keys = new Set([...keyboard, ...pointers]);
  return {
    forward: Number(keys.has("w") || keys.has("arrowup")) - Number(keys.has("s") || keys.has("arrowdown")),
    strafe: Number(keys.has("d") || keys.has("arrowright")) - Number(keys.has("a") || keys.has("arrowleft")),
  };
}
export function isWalkEditingTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]'));
}
