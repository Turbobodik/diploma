import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { CreateProjectForm } from './CreateProjectForm';

describe('CreateProjectForm', () => {
  it('validates required and minimum length constraints', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(true);
    render(<CreateProjectForm onSubmit={onSubmit} />);

    await user.click(screen.getByRole('button', { name: 'Create project' }));
    expect(screen.getByText('Project name is required.')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Project name'), 'A');
    await user.click(screen.getByRole('button', { name: 'Create project' }));
    expect(screen.getByText('Project name must be at least 2 characters.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits trimmed project name and clears input on success', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(true);
    render(<CreateProjectForm onSubmit={onSubmit} />);

    const input = screen.getByLabelText('Project name');
    await user.type(input, '  SciFact NLI Benchmark  ');
    await user.click(screen.getByRole('button', { name: 'Create project' }));

    expect(onSubmit).toHaveBeenCalledWith('SciFact NLI Benchmark');
    expect(input).toHaveValue('');
  });

  it('shows server conflict error without clearing user input', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(false);
    render(
      <CreateProjectForm
        serverError="A project with this name already exists."
        onSubmit={onSubmit}
      />,
    );

    const input = screen.getByLabelText('Project name');
    await user.type(input, 'Existing Study');
    await user.click(screen.getByRole('button', { name: 'Create project' }));

    expect(screen.getByRole('alert')).toHaveTextContent('A project with this name already exists.');
    expect(input).toHaveValue('Existing Study');
  });
});
