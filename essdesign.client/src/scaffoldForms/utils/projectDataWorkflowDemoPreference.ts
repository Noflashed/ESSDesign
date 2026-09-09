// Derived from ESSApp/src/utils/projectDataWorkflowDemoPreference.ts; regenerate with scripts/sync-ios-scaffold-forms.py.
import AsyncStorage from '../browser/storage';

const WORKFLOW_DEMO_HIDDEN_KEY = 'ess_project_data_workflow_demo_hidden_v2';

function preferenceKey(userId: string): string {
  return `${WORKFLOW_DEMO_HIDDEN_KEY}:${userId}`;
}

export async function shouldShowProjectDataWorkflowDemo(userId: string): Promise<boolean> {
  const value = await AsyncStorage.getItem(preferenceKey(userId));
  return value !== 'true';
}

export async function hideProjectDataWorkflowDemo(userId: string): Promise<void> {
  await AsyncStorage.setItem(preferenceKey(userId), 'true');
}
