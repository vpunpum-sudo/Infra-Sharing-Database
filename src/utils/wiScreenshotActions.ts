export const WI_ALLOWED_ACTIONS = [
  'fillLogin', 'submitLogin', 'goto', 'expandRoutesList', 'focusAllObjects',
  'leftClickPoint', 'rightClickPoint', 'pressEscape', 'closePopup'
] as const;

export type WiAllowedAction = (typeof WI_ALLOWED_ACTIONS)[number];
export function assertAllowedAction(name: string): asserts name is WiAllowedAction {
  if (!(WI_ALLOWED_ACTIONS as readonly string[]).includes(name)) throw new Error(`Disallowed page action: ${name}`);
}

export const REQUIRED_MENU_ITEMS = ['Cut Fiber Here', 'Split at Enclosure', 'Edit'] as const;
export function missingMenuItems(visibleTexts: string[]): string[] {
  return REQUIRED_MENU_ITEMS.filter(item => !visibleTexts.some(text => text.trim() === item));
}
