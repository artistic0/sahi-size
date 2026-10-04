// Import first in every worker entry: no network at all.
import { applyLockdown } from './lockdownCore'

applyLockdown()
