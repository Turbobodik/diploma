import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { AuthForm } from './AuthForm';

describe('AuthForm', () => {
  it('validates empty and malformed login fields before submitting', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<AuthForm onSubmit={onSubmit} />);

    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByText('Email address is required.')).toBeInTheDocument();
    expect(screen.getByText('Password is required.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText('Email address'), 'not-an-email');
    await user.type(screen.getByLabelText('Password'), 'pass');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByText('Enter a valid email address.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('enforces display name and 8+ char password in register mode', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<AuthForm onSubmit={onSubmit} />);

    await user.click(screen.getByRole('tab', { name: 'Create account' }));
    await user.type(screen.getByLabelText('Email address'), 'scholar@ehu.lt');
    await user.type(screen.getByLabelText('Password'), 'short');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(screen.getByText('Display name is required.')).toBeInTheDocument();
    expect(screen.getByText('Password must be at least 8 characters.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText('Full name'), 'Bahdan Kanoplich');
    await user.clear(screen.getByLabelText('Password'));
    await user.type(screen.getByLabelText('Password'), 'StrongPass123!');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(onSubmit).toHaveBeenCalledWith({
      mode: 'register',
      email: 'scholar@ehu.lt',
      password: 'StrongPass123!',
      displayName: 'Bahdan Kanoplich',
    });
  });

  it('displays server errors passed from parent state', () => {
    render(<AuthForm serverError="Invalid email or password" onSubmit={vi.fn()} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Invalid email or password');
  });
});
