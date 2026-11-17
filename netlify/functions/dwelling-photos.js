import {createClient} from '@supabase/supabase-js';
import sharp from 'sharp';
import {photoHandler} from './_shared/dwellingPhotos.mjs';
// Disabled until separately reviewed database/storage changes and matching attestation key are configured.
export default photoHandler({env:name=>globalThis.Netlify?.env?.get(name),createClient,sharp});
