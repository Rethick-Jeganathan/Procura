import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ErrorBoundary from '../components/ErrorBoundary';
import NotFound from '../pages/NotFound';

// -------------------------------------------------------
// ErrorBoundary
// -------------------------------------------------------

describe('ErrorBoundary', () => {
  /**
   * A component that throws during render, used to trigger ErrorBoundary.
   */
  const ThrowingComponent = ({ message }: { message: string }) => {
    throw new Error(message);
  };

  it('catches errors and displays the fallback error UI', () => {
    // Suppress console.error output from React's error boundary logging
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <ThrowingComponent message="Test explosion" />
      </ErrorBoundary>,
    );

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('Test explosion')).toBeInTheDocument();
    expect(screen.getByText('Reload Page')).toBeInTheDocument();

    consoleSpy.mockRestore();
  });

  it('renders children normally when no error occurs', () => {
    render(
      <ErrorBoundary>
        <div>Everything is fine</div>
      </ErrorBoundary>,
    );

    expect(screen.getByText('Everything is fine')).toBeInTheDocument();
  });
});

// -------------------------------------------------------
// NotFound page
// -------------------------------------------------------

describe('NotFound', () => {
  it('renders the 404 page with expected content', () => {
    render(
      <MemoryRouter>
        <NotFound />
      </MemoryRouter>,
    );

    expect(screen.getByText('404')).toBeInTheDocument();
    expect(screen.getByText('Page not found')).toBeInTheDocument();
    expect(
      screen.getByText(
        "The page you're looking for doesn't exist or has been moved.",
      ),
    ).toBeInTheDocument();
  });

  it('renders Go Back and Dashboard buttons', () => {
    render(
      <MemoryRouter>
        <NotFound />
      </MemoryRouter>,
    );

    expect(screen.getByText('Go Back')).toBeInTheDocument();
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });
});
