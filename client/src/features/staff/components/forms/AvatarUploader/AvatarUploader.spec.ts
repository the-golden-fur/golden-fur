import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import * as staffApi from '../../../api/staff.api';
import { AvatarUploader } from './AvatarUploader';

vi.mock('../../../api/staff.api', () => ({
  uploadAvatar: vi.fn(),
}));

function renderUploader(onUploaded = vi.fn()) {
  return render(
    createElement(AvatarUploader, {
      staffId: 'staff-1',
      accessToken: 'token',
      currentAvatarUrl: null,
      onUploaded,
    })
  );
}

describe('AvatarUploader', () => {
  it('shows the new avatar on a successful upload', async () => {
    vi.mocked(staffApi.uploadAvatar).mockResolvedValue({
      data: { profile_photo_url: 'https://cdn.example.com/new-avatar.png' },
      error: null,
    });
    const onUploaded = vi.fn();
    renderUploader(onUploaded);

    const file = new File(['x'], 'avatar.png', { type: 'image/png' });
    await userEvent.upload(screen.getByLabelText(/avatar file/i), file);

    const image = await screen.findByRole('img', { name: /your avatar/i });
    expect(image).toHaveAttribute(
      'src',
      'https://cdn.example.com/new-avatar.png'
    );
    expect(onUploaded).toHaveBeenCalledWith(
      'https://cdn.example.com/new-avatar.png'
    );
  });

  it('shows an inline error and never calls the API for an unsupported file type', async () => {
    renderUploader();

    // fireEvent bypasses userEvent's `accept`-attribute filtering so we can
    // exercise our own client-side mime check, not just the browser's picker.
    const file = new File(['x'], 'avatar.gif', { type: 'image/gif' });
    fireEvent.change(screen.getByLabelText(/avatar file/i), {
      target: { files: [file] },
    });

    expect(
      await screen.findByText(/unsupported file type/i)
    ).toBeInTheDocument();
    expect(staffApi.uploadAvatar).not.toHaveBeenCalled();
  });

  it('shows an inline error when the upload request fails', async () => {
    vi.mocked(staffApi.uploadAvatar).mockResolvedValue({
      data: null,
      error: 'Upload failed',
    });
    renderUploader();

    const file = new File(['x'], 'avatar.png', { type: 'image/png' });
    await userEvent.upload(screen.getByLabelText(/avatar file/i), file);

    expect(await screen.findByText('Upload failed')).toBeInTheDocument();
  });
});
