// Usage: npm run hash   (prompts without echoing is not available in plain node, so pass via env)
//   PW='your long random passphrase' npm run hash
import bcrypt from 'bcryptjs';

const pw = process.env.PW;
if (!pw || pw.length < 12) {
  console.error("Set a passphrase of at least 12 characters: PW='...' npm run hash");
  process.exit(1);
}
console.log(bcrypt.hashSync(pw, 12));
