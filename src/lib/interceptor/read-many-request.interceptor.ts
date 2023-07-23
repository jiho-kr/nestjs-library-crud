import { CallHandler, ExecutionContext, mixin, NestInterceptor, UnprocessableEntityException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate, validateSync } from 'class-validator';
import { Request } from 'express';
import _ from 'lodash';
import { Observable } from 'rxjs';

import { CustomReadManyRequestOptions } from './custom-request.interceptor';
import { RequestAbstractInterceptor } from '../abstract';
import { CRUD_ROUTE_ARGS, CUSTOM_REQUEST_OPTIONS } from '../constants';
import { CRUD_POLICY } from '../crud.policy';
import { PaginationCursorDto } from '../dto/pagination-cursor.dto';
import { PaginationOffsetDto } from '../dto/pagination-offset.dto';
import { CrudOptions, FactoryOption, Method, Sort, GROUP, PaginationType, PaginationRequest } from '../interface';
import { CrudReadManyRequest } from '../request';

const method = Method.READ_MANY;
export function ReadManyRequestInterceptor(crudOptions: CrudOptions, factoryOption: FactoryOption) {
    class MixinInterceptor extends RequestAbstractInterceptor implements NestInterceptor {
        constructor() {
            super(factoryOption.logger);
        }

        async intercept(context: ExecutionContext, next: CallHandler<unknown>): Promise<Observable<unknown>> {
            const req: Record<string, any> = context.switchToHttp().getRequest<Request>();
            const readManyOptions = crudOptions.routes?.[method] ?? {};

            const customReadManyRequestOptions: CustomReadManyRequestOptions = req[CUSTOM_REQUEST_OPTIONS];
            const paginationType = (readManyOptions.paginationType ?? CRUD_POLICY[method].default?.paginationType) as PaginationType;

            if (req.params) {
                Object.assign(req.query, req.params);
            }

            const pagination = this.getPaginationRequest(paginationType, req.query);

            const query = await (async () => {
                if (
                    (pagination.type === PaginationType.CURSOR && !_.isNil(pagination['nextCursor'])) ||
                    (pagination.type === PaginationType.OFFSET && (!_.isNil(pagination['offset']) || !_.isNil(pagination['limit'])))
                ) {
                    return {};
                }
                return this.validateQuery(req.query);
            })();
            const crudReadManyRequest: CrudReadManyRequest<typeof crudOptions.entity> = new CrudReadManyRequest<typeof crudOptions.entity>()
                .setPrimaryKey(factoryOption.primaryKeys ?? [])
                .setPagination(pagination)
                .setWithDeleted(
                    _.isBoolean(customReadManyRequestOptions?.softDeleted)
                        ? customReadManyRequestOptions.softDeleted
                        : crudOptions.routes?.[method]?.softDelete ?? (CRUD_POLICY[method].default.softDeleted as boolean),
                )
                .setWhere(query)
                .setTake(readManyOptions.numberOfTake ?? CRUD_POLICY[method].default.numberOfTake)
                .setSort(readManyOptions.sort ? Sort[readManyOptions.sort] : (CRUD_POLICY[method].default.sort as Sort))
                .setRelations(this.getRelations(customReadManyRequestOptions))
                .generate();

            this.crudLogger.logRequest(req, crudReadManyRequest.toString());
            req[CRUD_ROUTE_ARGS] = crudReadManyRequest;

            return next.handle();
        }

        getPaginationRequest(paginationType: PaginationType, query: Record<string, unknown>): PaginationRequest {
            const plain = query ?? {};
            const transformed =
                paginationType === PaginationType.OFFSET
                    ? plainToInstance(PaginationOffsetDto, plain, { excludeExtraneousValues: true })
                    : plainToInstance(PaginationCursorDto, plain, { excludeExtraneousValues: true });
            const [error] = validateSync(transformed, { stopAtFirstError: true });

            if (error) {
                throw new UnprocessableEntityException(error);
            }

            if (transformed.type === PaginationType.CURSOR && transformed.nextCursor && !transformed.query) {
                transformed.query = 'e30=';
            }

            return transformed;
        }

        async validateQuery(query: Record<string, unknown>) {
            if (_.isNil(query)) {
                return {};
            }

            const transformed = plainToInstance(crudOptions.entity, query, { groups: [GROUP.READ_MANY] });
            const errorList = await validate(transformed, {
                groups: [GROUP.READ_MANY],
                whitelist: true,
                forbidNonWhitelisted: true,
                stopAtFirstError: true,
                forbidUnknownValues: false,
            });

            if (errorList.length > 0) {
                this.crudLogger.log(errorList, 'ValidationError');
                throw new UnprocessableEntityException(errorList);
            }
            return transformed;
        }

        getRelations(customReadManyRequestOptions: CustomReadManyRequestOptions): string[] {
            if (Array.isArray(customReadManyRequestOptions?.relations)) {
                return customReadManyRequestOptions.relations;
            }
            if (crudOptions.routes?.[method]?.relations === false) {
                return [];
            }
            if (crudOptions.routes?.[method] && Array.isArray(crudOptions.routes?.[method]?.relations)) {
                return crudOptions.routes[method].relations;
            }
            return factoryOption.relations;
        }
    }

    return mixin(MixinInterceptor);
}
