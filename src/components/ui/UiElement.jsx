import { uiElementAttributes } from '../../config/uiTerminology.js';

/** Adds opt-in developer terminology metadata without affecting normal UI. */
export function UiElement({ as: Component = 'div', type, name, undefinedElement = false, className, children, ...props }) {
  return (
    <Component
      className={className}
      {...uiElementAttributes(type, name, { undefinedElement })}
      {...props}
    >
      {children}
    </Component>
  );
}
