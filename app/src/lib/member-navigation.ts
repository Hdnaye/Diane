import { router } from 'expo-router';

/** Back to the members list, also when the form was opened directly (web link). */
export function backToMembers() {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace('/members');
  }
}
