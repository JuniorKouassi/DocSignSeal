import { getCurrentContext } from '../../../../../lib/auth/dal';
import { TypeSignatureForm } from './TypeSignatureForm';

export default async function TypeSignaturePage() {
  const { user } = await getCurrentContext();
  return <TypeSignatureForm initialName={user.name} />;
}
