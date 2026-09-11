import type { EditorModel } from './model';
import type { AccountSync } from './account-sync';
import { node, button, input } from './dom';

export function showAccount(
  model: EditorModel,
  sync: AccountSync,
  report: (message: string, error?: boolean) => void,
  canLeave: () => boolean,
): void {
  const dialog = node('dialog', 'account-dialog'),
    body = node('div');
  dialog.append(node('h2', '', 'Project continuity'), body);

  const fail = (error: unknown) => report(String(error), true);
  const render = () => {
    body.replaceChildren();
    const endpoint = input('Sync server', sync.endpoint);
    endpoint.input.setAttribute('autocomplete', 'url');
    const applyEndpoint = () => {
      sync.setEndpoint(endpoint.input.value);
      report(`Sync server set to ${sync.endpoint}`);
    };
    body.append(endpoint.row);
    if (!sync.signedIn) {
      const email = input('Email', ''),
        password = input('Password', '', 'password'),
        status = node('p', 'settings-note', 'Accounts are optional. With a reachable ProtoMake sync server, the same projects can be opened on desktop or mobile.');
      email.input.autocomplete = 'email';
      password.input.autocomplete = 'current-password';
      const act = async (kind: 'signin' | 'signup') => {
        try {
          applyEndpoint();
          if (kind === 'signup') await sync.signUp(email.input.value, password.input.value);
          else await sync.signIn(email.input.value, password.input.value);
          report(`${kind === 'signup' ? 'Created' : 'Signed into'} ProtoMake account ${sync.user!.email}`);
          render();
        } catch (error) {
          fail(error);
        }
      };
      const actions = node('div', 'actions');
      actions.append(
        button('Sign in', () => void act('signin')),
        button('Create account', () => void act('signup')),
        button('Close', () => dialog.close()),
      );
      body.append(status, email.row, password.row, actions);
      return;
    }

    const account = node('p', '', `Signed in as ${sync.user!.email}`),
      actions = node('div', 'actions'),
      list = node('div', 'cloud-projects'),
      status = node('p', 'settings-note', 'Cloud saves use revision checks. A stale device cannot silently overwrite a newer project.');
    actions.append(
      button('Apply server', () => {
        try {
          const before = sync.endpoint;
          applyEndpoint();
          if (sync.endpoint !== before) render();
        } catch (error) { fail(error); }
      }),
      button('Save current to account', () =>
        void sync
          .save(structuredClone(model.project), model.sceneId)
          .then((revision) => {
            report(`Saved ${model.project.name} to account · cloud revision ${revision}`);
            return populate();
          })
          .catch(fail),
      ),
      button('Refresh', () => void populate()),
      button('Sign out', () => void sync.signOutRemote().then(() => render()).catch(fail)),
      button('Close', () => dialog.close()),
    );
    const populate = async () => {
      try {
        list.replaceChildren(node('p', '', 'Loading cloud projects…'));
        const projects = await sync.list();
        list.replaceChildren();
        if (!projects.length) list.append(node('p', 'empty', 'No account projects yet.'));
        for (const project of projects) {
          const row = node('div', 'saved-project'),
            info = node('span', '', `${project.name} · r${project.revision} · ${new Date(project.updated).toLocaleString()}`),
            controls = node('span', 'cloud-actions');
          controls.append(
            button('Open', () =>
              void (async () => {
                if (!canLeave()) return;
                const cloud = await sync.load(project.id);
                model.load(cloud.project);
                if (cloud.activeScene && model.project.scenes.some((s) => s.id === cloud.activeScene))
                  model.switchScene(cloud.activeScene);
                report(`Opened ${cloud.name} from account · revision ${cloud.revision}`);
                dialog.close();
              })().catch(fail),
            ),
            button('Delete', () =>
              void (async () => {
                if (!confirm(`Delete ${project.name} from this account?`)) return;
                await sync.delete(project.id);
                report(`Deleted cloud copy of ${project.name}`);
                await populate();
              })().catch(fail),
            ),
          );
          row.append(info, controls);
          list.append(row);
        }
      } catch (error) {
        list.replaceChildren(node('p', 'error', String(error)));
      }
    };
    body.append(account, status, actions, list);
    void populate();
  };
  dialog.onclose = () => dialog.remove();
  document.body.append(dialog);
  render();
  dialog.showModal();
}
