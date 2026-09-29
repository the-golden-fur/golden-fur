import { useToastContext } from './ToastContext';

/** `const { showToast } = useToast(); showToast('Saved', 'success');` */
export function useToast() {
  return useToastContext();
}
