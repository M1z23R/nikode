import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'get' })
export class GetPipe implements PipeTransform {
  transform(obj: Record<string, unknown>, key: string): unknown {
    return obj?.[key];
  }
}
