import { getCurrentContext } from '../../../lib/auth/dal';
import { listOrgStamps, listApplicableStamps, listStampPermissions } from '../../../lib/stamps/queries';
import { listOrgMembers } from '../../../lib/organizations/queries';
import StampCard from './StampCard';
import styles from './page.module.css';
import UploadStampForm from './UploadStampForm';

export default async function StampsPage() {
  const { user, membership, organization } = await getCurrentContext();
  const isAdmin = membership.role === 'owner' || membership.role === 'admin';

  if (!isAdmin) {
    const stamps = await listApplicableStamps(organization.id, user.id);
    return (
      <div>
        <div className={styles.header}>
          <h1 className={styles.title}>Stamps</h1>
        </div>
        {stamps.length === 0 ? (
          <p className={styles.empty}>You don&rsquo;t have permission to apply any stamp yet. Ask an admin.</p>
        ) : (
          <div className={styles.grid}>
            {stamps.map((s) => (
              <div className={styles.card} key={s.id}>
                {/* eslint-disable-next-line @next/next/no-img-element -- server-decrypted asset, not a static file */}
                <img className={styles.thumb} src={`/api/stamps/${s.id}/image`} alt={s.name} />
                <div className={styles.name}>{s.name}</div>
                <p className={styles.meta}>{s.kind}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  const [stamps, members] = await Promise.all([
    listOrgStamps(organization.id),
    listOrgMembers(organization.id),
  ]);
  const permissionsByStamp = await Promise.all(stamps.map((s) => listStampPermissions(s.id)));

  return (
    <div>
      <div className={styles.header}>
        <h1 className={styles.title}>Stamps</h1>
      </div>

      {stamps.length === 0 ? (
        <p className={styles.empty}>No stamps yet. Add your organization&rsquo;s official seal below.</p>
      ) : (
        <div className={styles.grid}>
          {stamps.map((s, i) => (
            <StampCard
              key={s.id}
              stampId={s.id}
              name={s.name}
              kind={s.kind}
              members={members}
              grantedUserIds={permissionsByStamp[i].map((p) => p.userId)}
            />
          ))}
        </div>
      )}

      <UploadStampForm />
    </div>
  );
}
