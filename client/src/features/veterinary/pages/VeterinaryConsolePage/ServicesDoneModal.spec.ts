import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { VetServiceCatalogItem } from '../../veterinary.types';
import {
  ServicesDoneModal,
  type ServicesDoneModalProps,
} from './ServicesDoneModal';

const CATALOG: VetServiceCatalogItem[] = [
  {
    id: 'svc-1',
    name: 'Major Surgery',
    default_price: 10000,
    created_by: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'svc-2',
    name: 'Deworming',
    default_price: 350,
    created_by: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  },
];

function renderModal(overrides: Partial<ServicesDoneModalProps> = {}) {
  const props: ServicesDoneModalProps = {
    petName: 'Whiskers',
    catalog: CATALOG,
    isSaving: false,
    error: null,
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
    ...overrides,
  };

  render(createElement(ServicesDoneModal, props));
  return props;
}

const nameBox = (n: number) =>
  screen.getByRole('combobox', { name: `Service ${n} name` });
const priceBox = (n: number) =>
  screen.getByRole('spinbutton', { name: `Service ${n} price` });
const confirm = () =>
  userEvent.click(
    screen.getByRole('button', { name: 'Complete consultation' })
  );

describe('ServicesDoneModal', () => {
  it('asks what was done for this pet', () => {
    renderModal();

    expect(
      screen.getByRole('dialog', { name: 'Services done for Whiskers' })
    ).toBeInTheDocument();
  });

  it('picking a service from the list fills in its usual price', async () => {
    const props = renderModal();

    await userEvent.type(nameBox(1), 'Major Surgery');

    expect(priceBox(1)).toHaveValue(10000);

    await confirm();

    expect(props.onConfirm).toHaveBeenCalledWith([
      { name: 'Major Surgery', amount: 10000 },
    ]);
  });

  it('the filled-in price can still be changed for this visit', async () => {
    const props = renderModal();

    await userEvent.type(nameBox(1), 'Major Surgery');
    await userEvent.clear(priceBox(1));
    await userEvent.type(priceBox(1), '12500');
    await confirm();

    expect(props.onConfirm).toHaveBeenCalledWith([
      { name: 'Major Surgery', amount: 12500 },
    ]);
  });

  it('a price the vet typed is not overwritten when the name then matches the list', async () => {
    const props = renderModal();

    await userEvent.type(priceBox(1), '8000');
    await userEvent.type(nameBox(1), 'Major Surgery');
    await confirm();

    expect(props.onConfirm).toHaveBeenCalledWith([
      { name: 'Major Surgery', amount: 8000 },
    ]);
  });

  it('any service that is not on the list can be typed in with its own price', async () => {
    const props = renderModal();

    await userEvent.type(nameBox(1), 'Tumor removal');
    await userEvent.type(priceBox(1), '15000');
    await confirm();

    expect(props.onConfirm).toHaveBeenCalledWith([
      { name: 'Tumor removal', amount: 15000 },
    ]);
  });

  it('several services can be listed, with a running total, and one can be removed', async () => {
    const props = renderModal();

    await userEvent.type(nameBox(1), 'Major Surgery');
    await userEvent.click(screen.getByRole('button', { name: 'Add service' }));
    await userEvent.type(nameBox(2), 'Deworming');

    expect(screen.getByText(/Total: ₱10,350\.00/)).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('button', { name: 'Remove service 1' })
    );

    expect(screen.getByText(/Total: ₱350\.00/)).toBeInTheDocument();

    await confirm();

    expect(props.onConfirm).toHaveBeenCalledWith([
      { name: 'Deworming', amount: 350 },
    ]);
  });

  it('can be confirmed with nothing listed - the visit completes with nothing extra to charge', async () => {
    const props = renderModal();

    await confirm();

    expect(props.onConfirm).toHaveBeenCalledWith([]);
  });

  it('will not complete with a service that has no price', async () => {
    const props = renderModal();

    await userEvent.type(nameBox(1), 'Tumor removal');
    await confirm();

    expect(props.onConfirm).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Tumor removal');
  });

  it('will not complete with a price that has no service name', async () => {
    const props = renderModal();

    await userEvent.type(priceBox(1), '500');
    await confirm();

    expect(props.onConfirm).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/name/i);
  });

  it('shows a save error from the server and can be cancelled', async () => {
    const props = renderModal({ error: 'Could not complete.' });

    expect(screen.getByRole('alert')).toHaveTextContent('Could not complete.');

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(props.onCancel).toHaveBeenCalled();
  });

  it('cannot be confirmed twice while saving', () => {
    renderModal({ isSaving: true });

    expect(
      screen.getByRole('button', { name: 'Completing...' })
    ).toBeDisabled();
  });
});
