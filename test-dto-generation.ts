/**
 * Test file to verify DTO schema generation
 * This file demonstrates the expected behavior
 */

// Simple DTO with basic types
class CreateProductDto {
  name: string;
  price: number;
  description: string;
  inStock: boolean;
  category?: string;
}

// Response DTO
class ProductResponseDto {
  id: number;
  name: string;
  price: number;
  description: string;
  inStock: boolean;
  category?: string;
  createdAt: Date;
}

// Expected OpenAPI Schema Output:
const expectedSchema = {
  components: {
    schemas: {
      CreateProductDto: {
        type: 'object',
        properties: {
          name: { type: 'string', example: 'John Doe' },
          price: { type: 'number', example: 99.99 },
          description: { type: 'string', example: 'Sample description text' },
          inStock: { type: 'boolean', example: true },
          category: { type: 'string', example: 'sample value' },
        },
        required: ['name', 'price', 'description', 'inStock'],
        example: {
          name: 'John Doe',
          price: 99.99,
          description: 'Sample description text',
          inStock: true,
        },
      },
      ProductResponseDto: {
        type: 'object',
        properties: {
          id: { type: 'number', example: 1 },
          name: { type: 'string', example: 'John Doe' },
          price: { type: 'number', example: 99.99 },
          description: { type: 'string', example: 'Sample description text' },
          inStock: { type: 'boolean', example: true },
          category: { type: 'string', example: 'sample value' },
          createdAt: { type: 'string', format: 'date-time', example: '2024-01-01T00:00:00.000Z' },
        },
        required: ['id', 'name', 'price', 'description', 'inStock', 'createdAt'],
        example: {
          id: 1,
          name: 'John Doe',
          price: 99.99,
          description: 'Sample description text',
          inStock: true,
          createdAt: '2024-01-01T00:00:00.000Z',
        },
      },
    },
  },
};

// Expected endpoint with request body:
const expectedEndpoint = {
  '/products': {
    post: {
      summary: 'create',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/CreateProductDto',
            },
          },
        },
      },
      responses: {
        '201': {
          description: 'Created',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ProductResponseDto',
              },
            },
          },
        },
      },
    },
  },
};

export { CreateProductDto, ProductResponseDto, expectedSchema, expectedEndpoint };
