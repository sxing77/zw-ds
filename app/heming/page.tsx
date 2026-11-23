import { permanentRedirect } from 'next/navigation';

export default function HemingPage() {
  permanentRedirect('/chart?mode=compatibility');
}
