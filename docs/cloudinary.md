# Cloudinary setup and verification

Mint Meow uses two deliberately different Cloudinary paths:

- Product and collection artwork is public catalog media.
- Child photos and payment proofs are uploaded with the `authenticated`
  delivery type. They are never stored as storefront URLs and are streamed
  only through an authenticated Admin route.

The browser never receives `CLOUDINARY_API_SECRET`. It receives a constrained,
short-lived signed upload request containing a random public ID, allowed image
formats, disabled overwrite, authenticated delivery, disabled backup, and no
original filename. An incoming `fl_force_strip` transformation removes embedded
IPTC, EXIF, and XMP metadata (including GPS metadata) before Cloudinary stores
the private asset.

## Credentials

Use a dedicated Cloudinary product environment for staging. In Cloudinary
Console, open **Settings -> API Keys**, generate an access key named for the
environment (for example, `mint-meow-staging`), and collect:

- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`

The API secret is server-only. Never place it in a `VITE_*` variable, paste it
into frontend code, or commit it. Cloudinary documents credential discovery
and rotation at:

- <https://cloudinary.com/documentation/developer_onboarding_faq_find_credentials>
- <https://cloudinary.com/documentation/ts_how_to_rotate_api_keys_in_the_console>

No unsigned upload preset is used. The Worker signs every direct upload.

## Local setup

1. Copy `.dev.vars.example` to `.dev.vars`.
2. Replace the three Cloudinary placeholders.
3. Generate strong local values for `SESSION_SECRET` and
   `ADMIN_BOOTSTRAP_TOKEN`.
4. Start the Worker with `pnpm dev`.
5. In another terminal, run `pnpm smoke:cloudinary`.

The smoke test uses a hard-coded one-pixel PNG with no customer data. It calls
the real Worker signing endpoint, uploads the synthetic image, confirms the
asset is authenticated, verifies unsigned delivery is blocked, verifies signed
delivery works, and deletes the Cloudinary asset in a `finally` cleanup path.
It never prints the API secret, upload signature, or claim token.

The signing endpoint creates one local checkout-upload row. The Cloudinary
asset is deleted immediately by the smoke test; the expired database row is
removed by the normal retention cleanup.

To test a deployed Worker, set `SMOKE_BASE_URL` to its HTTPS origin before
running the same command with credentials for that environment.

## Cloudflare staging and production

Set Cloudinary values on each Worker environment independently. Treat
`CLOUDINARY_API_SECRET` as a Worker secret. The cloud name and API key are
identifiers that may be configured as Worker variables, although keeping all
three in the deployment secret manager is acceptable.

The current staging Worker is:

<https://personalized-storybooks-eg-staging.mint-meow.workers.dev>

Its Cloudinary values are stored as encrypted Worker secrets. Verify the
deployed signing path after every credential rotation or upload-policy change:

```sh
SMOKE_BASE_URL=https://personalized-storybooks-eg-staging.mint-meow.workers.dev pnpm smoke:cloudinary
```

The Vite plugin writes an ignored `.dev.vars` copy under `dist/` for local
previewing. It is outside the static asset directory and is not deployed, but
`dist/` must remain ignored and must never be shared or archived.

Do not reuse production child-photo assets for staging tests. Before connecting
the public domain, verify with synthetic data:

1. private photo signing and upload;
2. checkout draft attachment and order submission;
3. authenticated Admin media viewing;
4. unsigned Cloudinary URL denial;
5. scheduled deletion and retry behavior;
6. catalog image replacement and deletion.

Cloudinary's authenticated-media and signed-delivery behavior is documented at:

- <https://cloudinary.com/documentation/control_access_to_media>
- <https://cloudinary.com/documentation/delivery_url_signatures>
- <https://cloudinary.com/documentation/image_upload_api_reference>
