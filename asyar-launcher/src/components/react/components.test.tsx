// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useState } from 'react';
import {
  Badge,
  Button,
  Checkbox,
  FormField,
  Input,
  MeterBar,
  SegmentedControl,
  Select,
  Spinner,
  StatusDot,
  Textarea,
  WarningBanner,
} from './index';

describe('Badge', () => {
  it('applies variant and modifiers', () => {
    render(<Badge text="Ready" variant="success" mono bordered />);
    const el = screen.getByText('Ready');
    expect(el.className).toContain('badge-success');
    expect(el.className).toContain('mono');
    expect(el.className).toContain('bordered');
  });
});

describe('Button', () => {
  it('renders children and handles clicks', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Save</Button>);
    fireEvent.click(screen.getByText('Save'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('is disabled when disabled is set', () => {
    render(<Button disabled>Save</Button>);
    expect((screen.getByText('Save').closest('button') as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('Input', () => {
  it('reports value changes', () => {
    const onValueChange = vi.fn();
    render(<Input onValueChange={onValueChange} placeholder="Query" />);
    fireEvent.change(screen.getByPlaceholderText('Query'), { target: { value: 'abc' } });
    expect(onValueChange).toHaveBeenCalledWith('abc');
  });

  it('renders a textarea when multiline', () => {
    render(<Textarea rows={4} placeholder="Notes" />);
    expect(screen.getByPlaceholderText('Notes').tagName).toBe('TEXTAREA');
  });
});

describe('Checkbox', () => {
  it('toggles under user interaction', () => {
    function Harness() {
      const [checked, setChecked] = useState(false);
      return (
        <Checkbox
          checked={checked}
          onChange={(next) => {
            setChecked(next);
          }}
        />
      );
    }
    const { container } = render(<Harness />);
    const input = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(input.checked).toBe(false);
    fireEvent.click(input);
    expect(input.checked).toBe(true);
  });
});

describe('Select', () => {
  it('reports the selected value', () => {
    const onChange = vi.fn();
    render(
      <Select
        value="a"
        onChange={onChange}
        options={[
          { value: 'a', label: 'Alpha' },
          { value: 'b', label: 'Beta' },
        ]}
      />,
    );
    fireEvent.change(screen.getByDisplayValue('Alpha'), { target: { value: 'b' } });
    expect(onChange).toHaveBeenCalledWith('b');
  });
});

describe('SegmentedControl', () => {
  it('only fires change for a different segment', () => {
    const onChange = vi.fn();
    function Harness() {
      const [value, setValue] = useState('a');
      return (
        <SegmentedControl
          value={value}
          onChange={(next) => {
            setValue(next);
            onChange(next);
          }}
          options={[
            { value: 'a', label: 'A' },
            { value: 'b', label: 'B' },
          ]}
        />
      );
    }
    render(<Harness />);
    const buttons = screen.getAllByRole('radio');
    expect(buttons[0].getAttribute('aria-checked')).toBe('true');
    fireEvent.click(buttons[0]);
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(buttons[1]);
    expect(onChange).toHaveBeenCalledWith('b');
    expect(buttons[1].getAttribute('aria-checked')).toBe('true');
  });
});

describe('Spinner', () => {
  it('hides unlabeled spinners from assistive tech', () => {
    const { container } = render(<Spinner size="sm" accent />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toContain('spinner--sm');
    expect(el.getAttribute('aria-hidden')).toBe('true');
  });

  it('exposes a status role when a label is provided', () => {
    render(<Spinner label="Loading" />);
    expect(screen.getByRole('status').getAttribute('aria-label')).toBe('Loading');
  });
});

describe('StatusDot', () => {
  it('sets colour class and CSS size variable', () => {
    const { container } = render(<StatusDot color="danger" pulse size={10} />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toContain('dot-danger');
    expect(el.className).toContain('pulse');
    expect(el.style.getPropertyValue('--dot-size')).toBe('10px');
  });
});

describe('MeterBar', () => {
  it('clamps the fill to 0–100%', () => {
    const { container } = render(<MeterBar value={1.5} />);
    const fill = container.querySelector('.meter-fill') as HTMLElement;
    expect(fill.style.width).toBe('100%');
  });
});

describe('WarningBanner', () => {
  it('renders icon, content, and optional actions', () => {
    render(
      <WarningBanner actions={<button>Fix</button>}>
        <span>Careful</span>
      </WarningBanner>,
    );
    expect(screen.getByText('⚠️')).toBeDefined();
    expect(screen.getByText('Careful')).toBeDefined();
    expect(screen.getByText('Fix')).toBeDefined();
  });
});

describe('FormField', () => {
  it('shows the error in preference to the hint', () => {
    const { rerender } = render(
      <FormField label="Name" error="Required" hint="Your name" id="name">
        <input />
      </FormField>,
    );
    expect(document.querySelector('.form-field')?.className).toContain('has-error');
    expect(screen.getByText('Required')).toBeDefined();
    expect(screen.queryByText('Your name')).toBeNull();
    rerender(
      <FormField label="Name" hint="Your name" id="name">
        <input />
      </FormField>,
    );
    expect(screen.getByText('Your name')).toBeDefined();
    expect((document.querySelector('.form-field-label') as HTMLLabelElement).htmlFor).toBe('name');
  });
});
