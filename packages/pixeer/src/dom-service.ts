/**
 * The DOM engine — this is how your agent understands and interacts with the page.
 *
 * It can read the page as semantic markdown, find every interactive element,
 * click buttons, fill inputs, and inspect React component state.
 *
 * Everything here is SSR-safe. You can import this on the server without
 * worrying about "document is not defined" errors.
 */

import type { InteractiveElement, ComponentStateResult, ScrollDirection } from './types';

const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';

/**
 * Build a unique CSS selector for an element so your agent can target it later.
 */
function generateSelector(element: Element): string {
  const unique = (selector: string): boolean => {
    try {
      return document.querySelectorAll(selector).length === 1;
    } catch {
      return false;
    }
  };

  if (element.id) {
    const selector = `#${CSS.escape(element.id)}`;
    if (unique(selector)) return selector;
  }

  const testId = element.getAttribute('data-testid');
  if (testId) {
    const selector = `[data-testid="${CSS.escape(testId)}"]`;
    if (unique(selector)) return selector;
  }

  const dataTest = element.getAttribute('data-test');
  if (dataTest) {
    const selector = `[data-test="${CSS.escape(dataTest)}"]`;
    if (unique(selector)) return selector;
  }

  const dataCy = element.getAttribute('data-cy');
  if (dataCy) {
    const selector = `[data-cy="${CSS.escape(dataCy)}"]`;
    if (unique(selector)) return selector;
  }

  const ariaLabel = element.getAttribute('aria-label');
  if (ariaLabel) {
    const selector = `${element.tagName.toLowerCase()}[aria-label="${CSS.escape(ariaLabel)}"]`;
    if (unique(selector)) return selector;
  }

  const name = element.getAttribute('name');
  if (name) {
    const selector = `${element.tagName.toLowerCase()}[name="${CSS.escape(name)}"]`;
    if (unique(selector)) return selector;
  }

  // Fall back to a path-based selector anchored on a stable ancestor when possible.
  const path: string[] = [];
  let current: Element | null = element;

  while (current && current !== document.body) {
    let selector: string | null = null;

    if (current.id) {
      selector = `#${CSS.escape(current.id)}`;
      path.unshift(selector);
      break;
    }

    const currentTestId = current.getAttribute('data-testid');
    if (currentTestId) {
      selector = `[data-testid="${CSS.escape(currentTestId)}"]`;
    }

    if (!selector) {
      const currentAriaLabel = current.getAttribute('aria-label');
      if (currentAriaLabel) {
        selector = `${current.tagName.toLowerCase()}[aria-label="${CSS.escape(currentAriaLabel)}"]`;
      }
    }

    if (!selector) {
      const currentName = current.getAttribute('name');
      if (currentName) {
        selector = `${current.tagName.toLowerCase()}[name="${CSS.escape(currentName)}"]`;
      }
    }

    if (!selector) {
      selector = current.tagName.toLowerCase();
    }

    const parent: Element | null = current.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter(
        (el: Element) => el.tagName === current!.tagName
      );
      if (siblings.length > 1 && !selector.startsWith('#') && !selector.includes('[')) {
        const index = siblings.indexOf(current) + 1;
        selector += `:nth-of-type(${index})`;
      }
    }

    path.unshift(selector);
    if (
      selector.startsWith('#') ||
      selector.includes('data-testid=') ||
      selector.includes('aria-label=') ||
      selector.includes('[name=')
    ) {
      break;
    }
    current = parent;
  }

  return path.join(' > ');
}

/**
 * Figure out what kind of element this is so your agent knows what it can do with it.
 */
function getElementType(element: Element): string {
  const tagName = element.tagName.toLowerCase();

  if (tagName === 'button') return 'button';
  if (tagName === 'a') return 'link';
  if (tagName === 'select') return 'select';
  if (tagName === 'textarea') return 'textarea';

  if (tagName === 'input') {
    const type = (element as HTMLInputElement).type || 'text';
    return `input:${type}`;
  }

  const role = element.getAttribute('role');
  if (role) {
    return `role:${role}`;
  }

  // Detect clickable divs/spans (onclick, tabindex, React onClick, cursor:pointer)
  if (
    element.hasAttribute('onclick') ||
    element.hasAttribute('tabindex') ||
    element.getAttribute('role') === 'button' ||
    hasReactClickHandler(element)
  ) {
    return 'clickable';
  }

  try {
    const style = window.getComputedStyle(element);
    if (style.cursor === 'pointer') {
      return 'clickable';
    }
  } catch {
    // ignore
  }

  return tagName;
}

/**
 * Check if a React app attached an onClick handler to this element.
 * Works by inspecting React's internal fiber/props keys on the DOM node.
 */
function hasReactClickHandler(element: Element): boolean {
  const keys = Object.keys(element);
  for (const key of keys) {
    if (key.startsWith('__reactProps$') || key.startsWith('__reactFiber$')) {
      const props = (element as unknown as Record<string, unknown>)[key] as Record<string, unknown> | null;
      if (props && typeof props === 'object' && typeof props.onClick === 'function') {
        return true;
      }
    }
  }
  return false;
}

/**
 * Determine if the user can interact with this element.
 */
function isInteractive(element: Element): boolean {
  const tagName = element.tagName.toLowerCase();
  const role = element.getAttribute('role');

  // Standard interactive elements
  if (
    ['button', 'a', 'input', 'select', 'textarea', 'summary'].includes(tagName)
  ) {
    return true;
  }

  // ARIA interactive roles
  if (
    role &&
    [
      'button',
      'link',
      'checkbox',
      'radio',
      'textbox',
      'combobox',
      'listbox',
      'menuitem',
      'tab',
      'switch',
      'slider',
    ].includes(role)
  ) {
    return true;
  }

  if (element.hasAttribute('tabindex')) {
    const tabindex = parseInt(element.getAttribute('tabindex') || '-1', 10);
    if (tabindex >= 0) return true;
  }

  if (element.hasAttribute('onclick')) {
    return true;
  }

  // React apps use synthetic onClick instead of HTML onclick
  if (hasReactClickHandler(element)) {
    return true;
  }

  // cursor:pointer is a common pattern for clickable divs
  try {
    const style = window.getComputedStyle(element);
    if (style.cursor === 'pointer') {
      return true;
    }
  } catch {
    // ignore
  }

  return false;
}

/**
 * Check if the element is currently enabled (not disabled or aria-disabled).
 */
function isEnabled(element: Element): boolean {
  if ((element as HTMLButtonElement | HTMLInputElement).disabled) {
    return false;
  }

  if (element.getAttribute('aria-disabled') === 'true') {
    return false;
  }

  return true;
}

function canReceivePointerEvents(element: Element): boolean {
  if (!(element instanceof HTMLElement)) {
    return false;
  }

  const style = window.getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden' || style.pointerEvents === 'none') {
    return false;
  }

  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return false;
  }

  return true;
}

function setInputValue(
  element: HTMLInputElement | HTMLTextAreaElement,
  value: string,
): void {
  const prototype = Object.getPrototypeOf(element) as
    | HTMLInputElement
    | HTMLTextAreaElement;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
  if (descriptor?.set) {
    descriptor.set.call(element, value);
  } else {
    element.value = value;
  }
}

/**
 * Pull out useful details about an element — placeholder, value, href, etc.
 */
function getElementMetadata(element: Element): Record<string, string> {
  const metadata: Record<string, string> = {};

  if (element.tagName.toLowerCase() === 'input') {
    const input = element as HTMLInputElement;
    if (input.placeholder) metadata.placeholder = input.placeholder;
    if (input.value) metadata.value = input.value;
    if (input.type) metadata.inputType = input.type;
  }

  if (element.tagName.toLowerCase() === 'a') {
    const link = element as HTMLAnchorElement;
    if (link.href) metadata.href = link.href;
  }

  const ariaLabel = element.getAttribute('aria-label');
  if (ariaLabel) metadata.ariaLabel = ariaLabel;

  const ariaDescription = element.getAttribute('aria-describedby');
  if (ariaDescription) {
    const describedByIds = ariaDescription.split(/\s+/).filter(Boolean);
    const descriptions = describedByIds
      .map((id) => document.getElementById(id)?.textContent?.trim() || '')
      .filter(Boolean);
    if (descriptions.length > 0) {
      metadata.description = descriptions.join(' ');
    }
  }

  // Developer-provided action hint — describes what this element does or reveals.
  // Add to your elements: <button data-pixeer="Opens IBAN panel">Receive</button>
  const pixeerHint = element.getAttribute('data-pixeer');
  if (pixeerHint) metadata.hint = pixeerHint;

  // ARIA state attributes — expose the element's current state and what it controls.
  // These let the agent know what's collapsed, what popup will open, what's toggled, etc.
  const ariaExpanded = element.getAttribute('aria-expanded');
  if (ariaExpanded !== null) metadata.expanded = ariaExpanded;

  const ariaHasPopup = element.getAttribute('aria-haspopup');
  if (ariaHasPopup && ariaHasPopup !== 'false') metadata.hasPopup = ariaHasPopup;

  const ariaChecked = element.getAttribute('aria-checked');
  if (ariaChecked !== null) metadata.checked = ariaChecked;

  const ariaPressed = element.getAttribute('aria-pressed');
  if (ariaPressed !== null) metadata.pressed = ariaPressed;

  const ariaSelected = element.getAttribute('aria-selected');
  if (ariaSelected !== null) metadata.selected = ariaSelected;

  // Follow aria-controls to preview what this element reveals when activated.
  // Even when the controlled panel is hidden, we can read its content and report it.
  const ariaControls = element.getAttribute('aria-controls');
  if (ariaControls) {
    const controlled = document.getElementById(ariaControls);
    if (controlled) {
      const isHidden =
        controlled.getAttribute('aria-hidden') === 'true' ||
        (controlled as HTMLElement).hidden ||
        (controlled instanceof HTMLElement &&
          window.getComputedStyle(controlled).display === 'none');
      const preview = controlled.textContent?.trim().replace(/\s+/g, ' ').slice(0, 120);
      metadata.controls =
        ariaControls +
        (isHidden ? ' [hidden]' : '') +
        (preview ? `: "${preview}"` : '');
    } else {
      metadata.controls = ariaControls;
    }
  }

  return Object.keys(metadata).length > 0 ? metadata : {};
}

/**
 * Try to derive a usable name for elements with no accessible name.
 * Catches icon-only close buttons, SVG-titled buttons, etc.
 */
function getFallbackName(element: Element): string {
  // title attribute
  const title = element.getAttribute('title');
  if (title) return title;

  // SVG <title> child
  const svgTitle = element.querySelector('svg title');
  if (svgTitle?.textContent?.trim()) return svgTitle.textContent.trim();

  // Close-button heuristics
  const isCloseCandidate =
    element.classList.contains('close') ||
    element.getAttribute('data-dismiss') !== null ||
    element.getAttribute('aria-dismiss') !== null ||
    /\bclose\b/i.test(element.className);

  if (isCloseCandidate) return 'Close';

  // Element inside a dialog/modal with close-like class
  const dialog = element.closest('[role="dialog"], [data-radix-portal], [data-state="open"]');
  if (dialog && isCloseCandidate) return 'Close';

  // Detect modal-like overlay containers (fixed/absolute full-screen with high z-index)
  const modalParent = dialog || (() => {
    let el: Element | null = element.parentElement;
    while (el) {
      const style = (el as HTMLElement).style;
      const cls = el.className || '';
      const isOverlay =
        (typeof cls === 'string' && /\bfixed\b/.test(cls) && /\binset-0\b/.test(cls)) ||
        (style?.position === 'fixed' && style?.inset === '0px');
      if (isOverlay) return el;
      el = el.parentElement;
    }
    return null;
  })();

  // If it's a button with only an icon (SVG/img child, no text), inside a modal
  if (
    modalParent &&
    element.tagName.toLowerCase() === 'button' &&
    !element.textContent?.trim() &&
    (element.querySelector('svg') || element.querySelector('img'))
  ) {
    return 'Close';
  }

  return '';
}

/**
 * Build a KeyboardEvent init dict for a given key name.
 */
function buildKeyInit(key: string): KeyboardEventInit {
  const keyMap: Record<string, { code: string; keyCode: number }> = {
    Enter: { code: 'Enter', keyCode: 13 },
    Escape: { code: 'Escape', keyCode: 27 },
    Tab: { code: 'Tab', keyCode: 9 },
    Backspace: { code: 'Backspace', keyCode: 8 },
    ArrowUp: { code: 'ArrowUp', keyCode: 38 },
    ArrowDown: { code: 'ArrowDown', keyCode: 40 },
    ArrowLeft: { code: 'ArrowLeft', keyCode: 37 },
    ArrowRight: { code: 'ArrowRight', keyCode: 39 },
    ' ': { code: 'Space', keyCode: 32 },
  };

  const mapped = keyMap[key];
  return {
    key,
    code: mapped?.code ?? `Key${key.toUpperCase()}`,
    keyCode: mapped?.keyCode ?? key.charCodeAt(0),
    bubbles: true,
    cancelable: true,
  };
}

/**
 * Your agent's eyes and hands on the page.
 *
 * Use these methods to read the page, find elements, click buttons,
 * fill inputs, and inspect React component state. Everything returns
 * gracefully on the server (empty strings, empty arrays, null).
 */
export const DomService = {
  /**
   * Get the page content as semantic markdown — optimized for LLM understanding.
   * This is the best way to give your agent context about what's on screen.
   */
  async getPageContext(): Promise<string> {
    if (!isBrowser) {
      return '';
    }

    try {
      const { convertHtmlToMarkdown } = await import('dom-to-semantic-markdown');
      return convertHtmlToMarkdown(document.body.innerHTML, {
        extractMainContent: true,
        refifyUrls: true,
      });
    } catch (error) {
      console.error('[Pixeer] Failed to get page context:', error);
      return document.body.innerText.substring(0, 10000);
    }
  },

  /**
   * Find every interactive element on the page — buttons, links, inputs,
   * dropdowns, and anything else the user can interact with. Each element
   * comes with an accessible name and a selector your agent can use.
   */
  async getInteractiveElements(): Promise<InteractiveElement[]> {
    if (!isBrowser) {
      return [];
    }

    const elements: InteractiveElement[] = [];

    try {
      const { computeAccessibleName, isInaccessible } = await import('dom-accessibility-api');

      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_ELEMENT,
        {
          acceptNode: (node) => {
            const element = node as Element;
            if (isInaccessible(element)) {
              return NodeFilter.FILTER_REJECT;
            }
            if (isInteractive(element)) {
              return NodeFilter.FILTER_ACCEPT;
            }
            return NodeFilter.FILTER_SKIP;
          },
        }
      );

      let node: Node | null;
      while ((node = walker.nextNode())) {
        const element = node as Element;

        try {
          let name = computeAccessibleName(element);
          if (!name && element.tagName.toLowerCase() !== 'input') {
            name = getFallbackName(element);
            if (!name) continue;
          }

          const selector = generateSelector(element);
          const type = getElementType(element);
          const enabled = isEnabled(element);
          const metadata = getElementMetadata(element);

          elements.push({
            name: name || metadata.placeholder || 'Unnamed',
            selector,
            type,
            enabled,
            ...(Object.keys(metadata).length > 0 && { metadata }),
          });
        } catch (error) {
          console.warn('[Pixeer] Failed to process element:', element, error);
        }
      }
    } catch (error) {
      console.error('[Pixeer] Failed to get interactive elements:', error);
    }

    return elements;
  },

  /**
   * Find an element by its accessible name — the way a user would describe it.
   * Tries interactive elements first, then falls back to any visible element
   * containing the text. Great for "click the Submit button" type commands.
   */
  async findByName(name: string): Promise<Element | null> {
    if (!isBrowser) {
      return null;
    }

    const normalizedSearch = name.toLowerCase().trim();

    try {
      const { computeAccessibleName, isInaccessible } = await import('dom-accessibility-api');

      // First pass: look through interactive elements
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_ELEMENT,
        {
          acceptNode: (node) => {
            const element = node as Element;
            if (isInaccessible(element)) {
              return NodeFilter.FILTER_REJECT;
            }
            if (isInteractive(element)) {
              return NodeFilter.FILTER_ACCEPT;
            }
            return NodeFilter.FILTER_SKIP;
          },
        }
      );

      let bestMatch: Element | null = null;
      let bestScore = 0;

      let node: Node | null;
      while ((node = walker.nextNode())) {
        const element = node as Element;

        try {
          const accessibleName = computeAccessibleName(element).toLowerCase();
          const ariaLabel =
            element.getAttribute('aria-label')?.toLowerCase() || '';
          const textContent = element.textContent?.toLowerCase().trim() || '';
          const placeholder =
            (element as HTMLInputElement).placeholder?.toLowerCase() || '';
          const titleAttr =
            element.getAttribute('title')?.toLowerCase() || '';
          const fallbackName = getFallbackName(element).toLowerCase();

          // Exact match — return immediately
          if (
            accessibleName === normalizedSearch ||
            ariaLabel === normalizedSearch ||
            placeholder === normalizedSearch ||
            textContent === normalizedSearch ||
            titleAttr === normalizedSearch ||
            fallbackName === normalizedSearch
          ) {
            return element;
          }

          // Score partial matches
          let score = 0;
          if (accessibleName.includes(normalizedSearch)) score += 3;
          if (ariaLabel.includes(normalizedSearch)) score += 2;
          if (textContent.includes(normalizedSearch)) score += 1;
          if (placeholder.includes(normalizedSearch)) score += 2;
          if (titleAttr.includes(normalizedSearch)) score += 2;
          if (fallbackName.includes(normalizedSearch)) score += 3;

          if (score > bestScore) {
            bestScore = score;
            bestMatch = element;
          }
        } catch {
          // keep going
        }
      }

      if (bestMatch) return bestMatch;

      // Second pass: search all visible elements by text content
      // This catches elements that don't look interactive but are clickable
      const fallbackWalker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_ELEMENT,
        {
          acceptNode: (node) => {
            const element = node as Element;
            if (isInaccessible(element)) {
              return NodeFilter.FILTER_REJECT;
            }
            return NodeFilter.FILTER_ACCEPT;
          },
        }
      );

      let fallbackMatch: Element | null = null;
      let fallbackScore = 0;

      while ((node = fallbackWalker.nextNode())) {
        const element = node as Element;
        const textContent = element.textContent?.toLowerCase().trim() || '';

        if (!textContent || !textContent.includes(normalizedSearch)) continue;

        // Prefer the most specific element (smallest text content)
        const textLen = textContent.length;
        const searchLen = normalizedSearch.length;
        const specificity = searchLen / Math.max(textLen, 1);
        const score = specificity * 10;

        if (score > fallbackScore) {
          fallbackScore = score;
          fallbackMatch = element;
        }
      }

      return fallbackMatch;
    } catch (error) {
      console.error('[Pixeer] findByName failed:', error);
      return null;
    }
  },

  /**
   * Click an element by CSS selector. Scrolls it into view first.
   */
  click(selector: string): boolean {
    if (!isBrowser) {
      return false;
    }

    try {
      const element = document.querySelector(selector);
      if (!element) {
        console.warn(`[Pixeer] Element not found: ${selector}`);
        return false;
      }

      if (!isEnabled(element) || !canReceivePointerEvents(element)) {
        return false;
      }

      element.scrollIntoView({ behavior: 'smooth', block: 'center' });

      if (element instanceof HTMLElement) {
        element.focus({ preventScroll: true });
      }

      const mouseDown = new MouseEvent('mousedown', { view: window, bubbles: true, cancelable: true });
      const mouseUp = new MouseEvent('mouseup', { view: window, bubbles: true, cancelable: true });
      const clickEvent = new MouseEvent('click', { view: window, bubbles: true, cancelable: true });

      const downOk = element.dispatchEvent(mouseDown);
      const upOk = element.dispatchEvent(mouseUp);
      const clickOk = element.dispatchEvent(clickEvent);

      return downOk && upOk && clickOk;
    } catch (error) {
      console.error('[Pixeer] Click failed:', error);
      return false;
    }
  },

  /**
   * Type text into an input or textarea by CSS selector.
   * Clears the existing value first, then fires input/change events
   * so React and other frameworks pick up the change.
   */
  type(selector: string, text: string): boolean {
    if (!isBrowser) {
      return false;
    }

    try {
      const element = document.querySelector(selector);

      if (!element) {
        console.warn(`[Pixeer] Element not found: ${selector}`);
        return false;
      }

      if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) {
        console.warn(`[Pixeer] Element is not an input or textarea: ${selector}`);
        return false;
      }

      if (!isEnabled(element)) {
        return false;
      }

      element.focus();
      setInputValue(element, '');
      setInputValue(element, text);

      // Fire keyboard events per character so React/Vue/etc. pick up the change
      for (const char of text) {
        const init = buildKeyInit(char);
        element.dispatchEvent(new KeyboardEvent('keydown', init));
        element.dispatchEvent(new KeyboardEvent('keypress', init));
        element.dispatchEvent(new KeyboardEvent('keyup', init));
      }

      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));

      return true;
    } catch (error) {
      console.error('[Pixeer] Type failed:', error);
      return false;
    }
  },

  /**
   * Read a React component's props and state by component name.
   * Uses the resq library to walk the React fiber tree.
   */
  async getComponentState(componentName: string): Promise<ComponentStateResult | null> {
    if (!isBrowser) {
      return null;
    }

    try {
      const { resq$ } = await import('resq');
      const component = resq$(componentName);

      if (!component) {
        console.warn(`[Pixeer] Component not found: ${componentName}`);
        return null;
      }

      return {
        props: component.props || {},
        state: component.state || null,
      };
    } catch (error) {
      console.error('[Pixeer] getComponentState failed:', error);
      return null;
    }
  },

  /**
   * Find an element by its accessible name and click it.
   * This is what your agent uses for "click the Submit button".
   */
  async clickByName(name: string): Promise<boolean> {
    const element = await this.findByName(name);
    if (!element) {
      console.warn(`[Pixeer] Element not found by name: ${name}`);
      return false;
    }

    const selector = generateSelector(element);
    return this.click(selector);
  },

  async clickByNameNth(name: string, nth: number): Promise<boolean> {
    const all = await this.findAllByName(name);
    const element = all[nth];
    if (!element) {
      console.warn(`[Pixeer] Element ${JSON.stringify(name)} not found at index ${nth} (found ${all.length})`);
      return false;
    }
    return this.click(generateSelector(element));
  },

  async findAllByName(name: string): Promise<Element[]> {
    if (!isBrowser) return [];
    const normalizedSearch = name.toLowerCase().trim();
    const matches: Element[] = [];
    try {
      const { computeAccessibleName, isInaccessible } = await import('dom-accessibility-api');
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_ELEMENT,
        {
          acceptNode: (node) => {
            const element = node as Element;
            if (isInaccessible(element)) return NodeFilter.FILTER_REJECT;
            if (isInteractive(element)) return NodeFilter.FILTER_ACCEPT;
            return NodeFilter.FILTER_SKIP;
          },
        }
      );
      let node: Node | null;
      while ((node = walker.nextNode())) {
        const element = node as Element;
        try {
          const accessibleName = computeAccessibleName(element).toLowerCase();
          const textContent = element.textContent?.toLowerCase().trim() ?? '';
          const ariaLabel = element.getAttribute('aria-label')?.toLowerCase() ?? '';
          if (
            accessibleName === normalizedSearch ||
            textContent === normalizedSearch ||
            ariaLabel === normalizedSearch
          ) {
            matches.push(element);
          }
        } catch { /* keep going */ }
      }
    } catch (error) {
      console.error('[Pixeer] findAllByName failed:', error);
    }
    return matches;
  },

  /**
   * Find an input by its accessible name and type into it.
   * This is what your agent uses for "type hello into the search box".
   */
  async typeByName(name: string, text: string): Promise<boolean> {
    const element = await this.findByName(name);
    if (!element) {
      console.warn(`[Pixeer] Element not found by name: ${name}`);
      return false;
    }

    const selector = generateSelector(element);
    return this.type(selector, text);
  },

  /**
   * Scroll an element (or the page) in a given direction.
   */
  scroll(selector: string | null, direction: ScrollDirection, amount: number = 300): boolean {
    if (!isBrowser) return false;

    try {
      const target = selector ? document.querySelector(selector) : document.documentElement;
      if (!target) {
        console.warn(`[Pixeer] Scroll target not found: ${selector}`);
        return false;
      }

      const scrollOpts: Record<ScrollDirection, [number, number]> = {
        up: [0, -amount],
        down: [0, amount],
        left: [-amount, 0],
        right: [amount, 0],
      };

      const [x, y] = scrollOpts[direction];
      target.scrollBy({ left: x, top: y, behavior: 'smooth' });
      return true;
    } catch (error) {
      console.error('[Pixeer] Scroll failed:', error);
      return false;
    }
  },

  /**
   * Find an element by name and scroll it.
   */
  async scrollByName(name: string, direction: ScrollDirection, amount: number = 300): Promise<boolean> {
    const element = await this.findByName(name);
    if (!element) {
      console.warn(`[Pixeer] Element not found by name: ${name}`);
      return false;
    }
    const selector = generateSelector(element);
    return this.scroll(selector, direction, amount);
  },

  /**
   * Dispatch a keyboard event (keydown/keypress/keyup) on an element.
   * Supports Enter, Escape, Tab, ArrowDown, etc.
   * On Enter, also submits the form if the element is inside one.
   */
  pressKey(selector: string | null, key: string): boolean {
    if (!isBrowser) return false;

    try {
      const element = selector
        ? document.querySelector(selector)
        : document.activeElement ?? document.body;
      if (!element) {
        console.warn(`[Pixeer] pressKey target not found: ${selector}`);
        return false;
      }

      const init = buildKeyInit(key);
      element.dispatchEvent(new KeyboardEvent('keydown', init));
      element.dispatchEvent(new KeyboardEvent('keypress', init));
      element.dispatchEvent(new KeyboardEvent('keyup', init));

      // On Enter, also submit the parent form if any
      if (key === 'Enter') {
        const form = (element as HTMLElement).closest?.('form');
        if (form) {
          if (typeof form.requestSubmit === 'function') {
            form.requestSubmit();
          } else {
            form.submit();
          }
        }
      }

      return true;
    } catch (error) {
      console.error('[Pixeer] pressKey failed:', error);
      return false;
    }
  },

  /**
   * Find an element by name and press a key on it.
   */
  async pressKeyByName(name: string, key: string): Promise<boolean> {
    const element = await this.findByName(name);
    if (!element) {
      console.warn(`[Pixeer] Element not found by name: ${name}`);
      return false;
    }
    const selector = generateSelector(element);
    return this.pressKey(selector, key);
  },
};

export default DomService;
