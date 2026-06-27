declare module "*.css" {}

declare module "*.html?raw" {
  const value: string
  export default value
}

declare module "*.svg?raw" {
  const value: string
  export default value
}
