export type Bindings = {
  ASSETS: {
    fetch(request: Request): Promise<Response>
  }
  ADMIN_BOOTSTRAP_TOKEN: string
  APP_BASE_URL: string
  CLOUDINARY_API_KEY: string
  CLOUDINARY_API_SECRET: string
  CLOUDINARY_CLOUD_NAME: string
  DB: D1Database
  EMAIL_FROM: string
  ENVIRONMENT: 'development' | 'production'
  RESEND_API_KEY: string
  SESSION_SECRET: string
}
