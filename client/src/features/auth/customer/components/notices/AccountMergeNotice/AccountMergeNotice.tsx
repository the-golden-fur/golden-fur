interface AccountMergeNoticeProps {
  message?: string;
}

export function AccountMergeNotice({
  message = 'Your account was linked successfully.',
}: AccountMergeNoticeProps) {
  return <p role="status">{message}</p>;
}
