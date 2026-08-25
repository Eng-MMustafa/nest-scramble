/**
 * Fixture covering every NestJS file-upload shape.
 *
 * The interceptors are declared locally so the fixture does not need multer
 * types installed; the scanner reads decorator names from the AST and never
 * evaluates them.
 */
import { Body, Controller, Post, UseInterceptors } from '@nestjs/common';

const interceptor = (..._args: unknown[]) => class {};

export const FileInterceptor = (_field: string) => interceptor();
export const FilesInterceptor = (_field: string, _max?: number) => interceptor();
export const FileFieldsInterceptor = (_fields: { name: string; maxCount?: number }[]) => interceptor();
export const AnyFilesInterceptor = () => interceptor();
export const UploadedFile = () => (_t: object, _k: string | symbol, _i: number) => undefined;
export const UploadedFiles = () => (_t: object, _k: string | symbol, _i: number) => undefined;

export class UploadMetaDto {
  /** Human-friendly label shown in the gallery */
  title!: string;

  description?: string;
}

export class MediaDto {
  id!: string;
  url!: string;
}

@Controller('media')
export class MediaController {
  /** Upload a single avatar */
  @Post('avatar')
  @UseInterceptors(FileInterceptor('avatar'))
  uploadAvatar(@UploadedFile() file: unknown): MediaDto {
    return {} as MediaDto;
  }

  @Post('gallery')
  @UseInterceptors(FilesInterceptor('photos', 10))
  uploadGallery(@UploadedFiles() files: unknown[]): MediaDto[] {
    return [];
  }

  @Post('mixed')
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'cover', maxCount: 1 },
      { name: 'attachments', maxCount: 5 },
    ]),
  )
  uploadMixed(@UploadedFiles() files: unknown): MediaDto {
    return {} as MediaDto;
  }

  @Post('any')
  @UseInterceptors(AnyFilesInterceptor())
  uploadAny(@UploadedFiles() files: unknown[]): MediaDto {
    return {} as MediaDto;
  }

  /** Upload a document together with its metadata */
  @Post('document')
  @UseInterceptors(FileInterceptor('document'))
  uploadWithMeta(@UploadedFile() file: unknown, @Body() meta: UploadMetaDto): MediaDto {
    return {} as MediaDto;
  }

  @Post('custom')
  uploadWithoutInterceptor(@UploadedFile() file: unknown): MediaDto {
    return {} as MediaDto;
  }

  @Post('json-only')
  createFromUrl(@Body() meta: UploadMetaDto): MediaDto {
    return {} as MediaDto;
  }
}
