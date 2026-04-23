import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DomService } from '../dom-service';

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('getInteractiveElements', () => {
  it('finds buttons, links, and inputs with correct names/types', async () => {
    document.body.innerHTML = `
      <button>Submit</button>
      <a href="/about">About</a>
      <input type="text" placeholder="Search" />
    `;

    const elements = await DomService.getInteractiveElements();
    const names = elements.map((e) => e.name);

    expect(names).toContain('Submit');
    expect(names).toContain('About');

    const btn = elements.find((e) => e.name === 'Submit');
    expect(btn?.type).toBe('button');

    const link = elements.find((e) => e.name === 'About');
    expect(link?.type).toBe('link');

    const input = elements.find((e) => e.type.startsWith('input'));
    expect(input).toBeDefined();
  });

  it('finds icon-only button with aria-label="Close"', async () => {
    document.body.innerHTML = `
      <button aria-label="Close"><svg><path d="M0 0"/></svg></button>
    `;

    const elements = await DomService.getInteractiveElements();
    const close = elements.find((e) => e.name === 'Close');
    expect(close).toBeDefined();
    expect(close?.type).toBe('button');
  });

  it('finds button inside role="dialog"', async () => {
    document.body.innerHTML = `
      <div role="dialog">
        <button>Confirm</button>
      </div>
    `;

    const elements = await DomService.getInteractiveElements();
    const confirm = elements.find((e) => e.name === 'Confirm');
    expect(confirm).toBeDefined();
  });

  it('finds icon-only close button with title attr inside dialog', async () => {
    document.body.innerHTML = `
      <div role="dialog">
        <button title="Close"><svg><path d="M0 0"/></svg></button>
      </div>
    `;

    const elements = await DomService.getInteractiveElements();
    const close = elements.find((e) => e.name === 'Close');
    expect(close).toBeDefined();
  });
});

describe('click', () => {
  it('dispatches mousedown/mouseup/click events', () => {
    document.body.innerHTML = '<button id="btn" style="width:100px;height:40px;">Click me</button>';
    const btn = document.getElementById('btn')!;

    // happy-dom returns 0x0 from getBoundingClientRect — stub it
    vi.spyOn(btn, 'getBoundingClientRect').mockReturnValue({
      width: 100, height: 40, x: 0, y: 0, top: 0, left: 0, right: 100, bottom: 40, toJSON: () => {},
    });

    const events: string[] = [];
    btn.addEventListener('mousedown', () => events.push('mousedown'));
    btn.addEventListener('mouseup', () => events.push('mouseup'));
    btn.addEventListener('click', () => events.push('click'));

    const result = DomService.click('#btn');
    expect(result).toBe(true);
    expect(events).toEqual(['mousedown', 'mouseup', 'click']);
  });
});

describe('clickByName', () => {
  it('finds and clicks an element by accessible name', async () => {
    document.body.innerHTML = '<button>Save</button>';
    const btn = document.querySelector('button')!;

    // Stub bounding rect for happy-dom
    vi.spyOn(btn, 'getBoundingClientRect').mockReturnValue({
      width: 80, height: 30, x: 0, y: 0, top: 0, left: 0, right: 80, bottom: 30, toJSON: () => {},
    });

    let clicked = false;
    btn.addEventListener('click', () => {
      clicked = true;
    });

    const result = await DomService.clickByName('Save');
    expect(result).toBe(true);
    expect(clicked).toBe(true);
  });
});

describe('type', () => {
  it('sets value and fires input/change/keyboard events', () => {
    document.body.innerHTML = '<input id="inp" type="text" />';
    const inp = document.getElementById('inp') as HTMLInputElement;

    const events: string[] = [];
    inp.addEventListener('input', () => events.push('input'));
    inp.addEventListener('change', () => events.push('change'));
    inp.addEventListener('keydown', () => events.push('keydown'));
    inp.addEventListener('keyup', () => events.push('keyup'));

    const result = DomService.type('#inp', 'hi');
    expect(result).toBe(true);
    expect(inp.value).toBe('hi');
    expect(events).toContain('input');
    expect(events).toContain('change');
    expect(events).toContain('keydown');
    expect(events).toContain('keyup');
  });
});

describe('pressKey', () => {
  it('dispatches correct KeyboardEvent for Enter', () => {
    document.body.innerHTML = '<input id="inp" type="text" />';
    const inp = document.getElementById('inp') as HTMLInputElement;
    inp.focus();

    const events: KeyboardEvent[] = [];
    inp.addEventListener('keydown', (e) => events.push(e));
    inp.addEventListener('keyup', (e) => events.push(e));

    const result = DomService.pressKey('#inp', 'Enter');
    expect(result).toBe(true);

    const keydown = events.find((e) => e.type === 'keydown');
    expect(keydown?.key).toBe('Enter');
    expect(keydown?.keyCode).toBe(13);
  });

  it('dispatches Escape key', () => {
    document.body.innerHTML = '<div id="target" tabindex="0"></div>';
    const target = document.getElementById('target')!;

    let receivedKey = '';
    target.addEventListener('keydown', (e) => {
      receivedKey = (e as KeyboardEvent).key;
    });

    DomService.pressKey('#target', 'Escape');
    expect(receivedKey).toBe('Escape');
  });

  it('submits form on Enter inside a form', () => {
    document.body.innerHTML = `
      <form id="form">
        <input id="inp" type="text" />
      </form>
    `;

    const form = document.getElementById('form') as HTMLFormElement;
    let submitted = false;

    // requestSubmit triggers submit event; mock it
    form.requestSubmit = vi.fn(() => {
      submitted = true;
    });

    DomService.pressKey('#inp', 'Enter');
    expect(submitted).toBe(true);
  });
});

describe('scroll', () => {
  it('calls scrollBy with correct args for down direction', () => {
    const spy = vi.spyOn(document.documentElement, 'scrollBy').mockImplementation(() => {});

    const result = DomService.scroll(null, 'down', 500);
    expect(result).toBe(true);
    expect(spy).toHaveBeenCalledWith({ left: 0, top: 500, behavior: 'smooth' });

    spy.mockRestore();
  });

  it('scrolls a specific element by selector', () => {
    document.body.innerHTML = '<div id="box" style="overflow:auto;height:100px;"></div>';
    const box = document.getElementById('box')!;
    const spy = vi.spyOn(box, 'scrollBy').mockImplementation(() => {});

    const result = DomService.scroll('#box', 'up', 200);
    expect(result).toBe(true);
    expect(spy).toHaveBeenCalledWith({ left: 0, top: -200, behavior: 'smooth' });

    spy.mockRestore();
  });
});

describe('findByName', () => {
  it('matches exact accessible name', async () => {
    document.body.innerHTML = '<button>Next</button>';
    const el = await DomService.findByName('Next');
    expect(el).toBeTruthy();
    expect(el?.tagName.toLowerCase()).toBe('button');
  });

  it('matches partial name', async () => {
    document.body.innerHTML = '<button>Go to Next Page</button>';
    const el = await DomService.findByName('Next');
    expect(el).toBeTruthy();
  });

  it('matches title attribute', async () => {
    document.body.innerHTML = '<button title="Settings"><svg></svg></button>';
    const el = await DomService.findByName('Settings');
    expect(el).toBeTruthy();
  });
});

describe('generateSelector', () => {
  it('produces id-based selector', async () => {
    document.body.innerHTML = '<button id="my-btn">Click</button>';
    const elements = await DomService.getInteractiveElements();
    const btn = elements.find((e) => e.name === 'Click');
    expect(btn?.selector).toBe('#my-btn');
  });

  it('produces data-testid selector', async () => {
    document.body.innerHTML = '<button data-testid="submit-btn">Submit</button>';
    const elements = await DomService.getInteractiveElements();
    const btn = elements.find((e) => e.name === 'Submit');
    expect(btn?.selector).toBe('[data-testid="submit-btn"]');
  });

  it('produces fallback selector when no id or testid', async () => {
    document.body.innerHTML = '<button>Lonely</button>';
    const elements = await DomService.getInteractiveElements();
    const btn = elements.find((e) => e.name === 'Lonely');
    expect(btn?.selector).toBeTruthy();
    // Should be able to re-query it
    const found = document.querySelector(btn!.selector);
    expect(found).toBeTruthy();
  });
});

describe('getInteractiveElements — edge cases', () => {
  it('marks disabled button as enabled:false', async () => {
    document.body.innerHTML = '<button disabled>Disabled</button>';
    const elements = await DomService.getInteractiveElements();
    const btn = elements.find((e) => e.name === 'Disabled');
    expect(btn).toBeDefined();
    expect(btn?.enabled).toBe(false);
  });

  it('finds ARIA role="button" element', async () => {
    document.body.innerHTML = '<div role="button" tabindex="0">Custom Button</div>';
    const elements = await DomService.getInteractiveElements();
    const el = elements.find((e) => e.name === 'Custom Button');
    expect(el).toBeDefined();
    expect(el?.type).toBe('role:button');
  });

  it('finds element with tabindex >= 0 and accessible name', async () => {
    document.body.innerHTML = '<span tabindex="0" aria-label="Focusable">x</span>';
    const elements = await DomService.getInteractiveElements();
    const el = elements.find((e) => e.name === 'Focusable');
    expect(el).toBeDefined();
  });

  it('finds input with metadata for placeholder and value', async () => {
    document.body.innerHTML = '<input placeholder="Email" value="hi@x.com" />';
    const elements = await DomService.getInteractiveElements();
    const input = elements.find((e) => e.metadata?.placeholder === 'Email');
    expect(input).toBeDefined();
    expect(input?.metadata?.value).toBe('hi@x.com');
  });

  it('includes href metadata on anchor elements', async () => {
    document.body.innerHTML = '<a href="/about">About</a>';
    const elements = await DomService.getInteractiveElements();
    const link = elements.find((e) => e.name === 'About');
    expect(link?.metadata?.href).toContain('/about');
  });

  it('finds aria-label element', async () => {
    document.body.innerHTML = '<button aria-label="Delete item"><svg/></button>';
    const elements = await DomService.getInteractiveElements();
    const btn = elements.find((e) => e.name === 'Delete item');
    expect(btn).toBeDefined();
  });
});

describe('click — edge cases', () => {
  it('returns false for disabled element', () => {
    document.body.innerHTML = '<button id="d" disabled>Nope</button>';
    const result = DomService.click('#d');
    expect(result).toBe(false);
  });

  it('returns false when selector matches nothing', () => {
    const result = DomService.click('#nonexistent');
    expect(result).toBe(false);
  });

  it('returns false when element has zero dimensions', () => {
    document.body.innerHTML = '<button id="z">Zero</button>';
    const btn = document.getElementById('z')!;
    vi.spyOn(btn, 'getBoundingClientRect').mockReturnValue({
      width: 0, height: 0, x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, toJSON: () => {},
    });
    const result = DomService.click('#z');
    expect(result).toBe(false);
  });
});

describe('clickByName — edge cases', () => {
  it('returns false when element not found by name', async () => {
    const result = await DomService.clickByName('NoSuchButton');
    expect(result).toBe(false);
  });
});

describe('type — edge cases', () => {
  it('returns false for a disabled input', () => {
    document.body.innerHTML = '<input id="d" disabled />';
    const result = DomService.type('#d', 'text');
    expect(result).toBe(false);
  });

  it('returns false when selector matches a non-input element', () => {
    document.body.innerHTML = '<div id="d">Not an input</div>';
    const result = DomService.type('#d', 'hello');
    expect(result).toBe(false);
  });

  it('returns false when selector matches nothing', () => {
    const result = DomService.type('#nonexistent', 'hello');
    expect(result).toBe(false);
  });
});

describe('typeByName — edge cases', () => {
  it('returns false when element not found by name', async () => {
    const result = await DomService.typeByName('Ghost Input', 'hello');
    expect(result).toBe(false);
  });

  it('fills textarea by name', async () => {
    document.body.innerHTML = '<textarea aria-label="Message"></textarea>';
    const result = await DomService.typeByName('Message', 'Hello world');
    expect(result).toBe(true);
    const ta = document.querySelector('textarea') as HTMLTextAreaElement;
    expect(ta.value).toBe('Hello world');
  });
});

describe('findByName — edge cases', () => {
  it('returns null when nothing matches', async () => {
    document.body.innerHTML = '<p>Static text</p>';
    const el = await DomService.findByName('NonExistentButton');
    expect(el).toBeNull();
  });

  it('matches by placeholder', async () => {
    document.body.innerHTML = '<input placeholder="Search here" />';
    const el = await DomService.findByName('Search here');
    expect(el).toBeTruthy();
    expect((el as HTMLInputElement).placeholder).toBe('Search here');
  });

  it('prefers exact match over partial match', async () => {
    document.body.innerHTML = `
      <button>Save</button>
      <button>Save and continue</button>
    `;
    const el = await DomService.findByName('Save');
    expect(el?.textContent?.trim()).toBe('Save');
  });
});

describe('pressKey — edge cases', () => {
  it('uses active element when selector is null', () => {
    document.body.innerHTML = '<input id="inp" />';
    const inp = document.getElementById('inp')!;
    inp.focus();

    let key = '';
    inp.addEventListener('keydown', (e) => { key = (e as KeyboardEvent).key; });

    DomService.pressKey(null, 'Tab');
    expect(key).toBe('Tab');
  });

  it('returns false when selector matches nothing', () => {
    const result = DomService.pressKey('#nonexistent', 'Enter');
    expect(result).toBe(false);
  });

  it('falls back to form.submit() when requestSubmit is not available', () => {
    document.body.innerHTML = `<form id="f"><input id="inp" /></form>`;
    const form = document.getElementById('f') as HTMLFormElement;
    let submitted = false;

    // Remove requestSubmit to exercise the submit() fallback
    (form as unknown as Record<string, unknown>).requestSubmit = undefined;
    form.submit = vi.fn(() => { submitted = true; });

    DomService.pressKey('#inp', 'Enter');
    expect(submitted).toBe(true);
  });
});

describe('pressKeyByName', () => {
  it('finds element by name and presses key', async () => {
    document.body.innerHTML = '<input aria-label="Query" />';
    let pressed = false;
    const inp = document.querySelector('input')!;
    inp.addEventListener('keydown', () => { pressed = true; });

    const result = await DomService.pressKeyByName('Query', 'Enter');
    expect(result).toBe(true);
    expect(pressed).toBe(true);
  });

  it('returns false when element not found by name', async () => {
    const result = await DomService.pressKeyByName('GhostButton', 'Enter');
    expect(result).toBe(false);
  });
});

describe('scroll — edge cases', () => {
  it('returns false when named element not found', async () => {
    const result = await DomService.scrollByName('GhostPanel', 'down');
    expect(result).toBe(false);
  });

  it('scrolls left and right', () => {
    const spyLeft = vi.spyOn(document.documentElement, 'scrollBy').mockImplementation(() => {});

    DomService.scroll(null, 'left', 100);
    expect(spyLeft).toHaveBeenCalledWith({ left: -100, top: 0, behavior: 'smooth' });

    DomService.scroll(null, 'right', 100);
    expect(spyLeft).toHaveBeenCalledWith({ left: 100, top: 0, behavior: 'smooth' });

    spyLeft.mockRestore();
  });
});

describe('getComponentState', () => {
  it('returns null when component is not found', async () => {
    const result = await DomService.getComponentState('NonExistentComponent');
    expect(result).toBeNull();
  });
});

describe('getPageContext', () => {
  it('returns a non-empty string for a page with content', async () => {
    document.body.innerHTML = '<h1>Hello</h1><p>World</p>';
    const ctx = await DomService.getPageContext();
    expect(typeof ctx).toBe('string');
    expect(ctx.length).toBeGreaterThan(0);
  });
});
