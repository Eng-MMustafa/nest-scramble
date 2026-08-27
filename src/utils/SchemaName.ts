/** Nest-Scramble | Developed by Mohamed Mustafa | MIT License **/

/**
 * Converts raw TypeScript type text into a name that is legal both as an
 * OpenAPI component key (`^[a-zA-Z0-9._-]+$`) and as a TypeScript identifier.
 *
 * The raw type text was used directly as the schema name, so an instantiated
 * generic such as `PaginatedDto<ProductDto>` — the standard pagination
 * pattern — produced a component name with `<` and `>` in it, which the
 * OpenAPI specification forbids and codegen tools reject. The typed client
 * had it worse: `export interface PaginatedDto<ProductDto>` declares a type
 * *parameter* named `ProductDto` instead of referencing the DTO.
 *
 *   `PaginatedDto<ProductDto>`   → `PaginatedDtoOfProductDto`
 *   `ApiResponse<UserDto, Meta>` → `ApiResponseOfUserDtoAndMeta`
 *   `PaginatedDto<ProductDto[]>` → `PaginatedDtoOfProductDtoArray`
 *
 * Returns `null` for shapes that have no usable name — inline object literals
 * (`{ a: string }`) and function types — which callers should inline rather
 * than register as named components.
 */
export function sanitizeTypeName(typeText: string | undefined): string | null {
  const text = (typeText ?? '').trim();
  if (!text || text.includes('{') || text.includes('=>')) {
    return null;
  }

  const name = text
    .replace(/\[\]/g, 'Array')
    .replace(/<\s*/g, 'Of')
    .replace(/\s*,\s*/g, 'And')
    .replace(/\s*>/g, '')
    .replace(/\s+/g, '')
    .replace(/[^A-Za-z0-9_]/g, '_');

  return /^[A-Za-z_]/.test(name) ? name : null;
}
