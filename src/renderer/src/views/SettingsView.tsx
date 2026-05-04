import type { User } from '@shared/types';
import './View.css';

interface Props {
  user: User | null;
}

export default function SettingsView({ user }: Props) {
  return (
    <div className="view">
      <div className="view-header">
        <h1 className="view-title">Settings</h1>
      </div>
      {user && (
        <div className="view-section">
          <h2 className="view-section-title">Your profile</h2>
          <dl className="view-dl">
            <div className="view-dl-row">
              <dt>Name</dt>
              <dd>{user.first_name} {user.last_name}</dd>
            </div>
            <div className="view-dl-row">
              <dt>Email</dt>
              <dd>{user.email}</dd>
            </div>
          </dl>
        </div>
      )}
    </div>
  );
}
