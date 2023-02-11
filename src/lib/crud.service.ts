import { ConflictException, NotFoundException } from '@nestjs/common';
import _ from 'lodash';
import { BaseEntity, DeepPartial, FindOptionsOrder, FindOptionsSelect, FindOptionsWhere, LessThan, MoreThan, Repository } from 'typeorm';

import { CrudAbstractService, CrudResponseType } from './abstract/crud.abstract.service';
import { CRUD_POLICY } from './crud.policy';
import { PaginationCursorDto } from './dto/pagination-cursor.dto';
import { PaginationOffsetDto } from './dto/pagination-offset.dto';
import {
    CrudReadManyRequest,
    CrudReadOneRequest,
    CrudResponseOptions,
    CrudResponseOption,
    CrudDeleteOneRequest,
    Method,
    CrudUpdateOneRequest,
    Sort,
    CrudUpsertRequest,
    CrudRecoverRequest,
    PaginationResponse,
    PaginationType,
    CrudSearchRequest,
    isCrudCreateManyRequest,
    CrudCreateOneRequest,
    CrudCreateManyRequest,
} from './interface';
import { PaginationHelper } from './provider/pagination.helper';
import { TypeOrmQueryBuilderHelper } from './provider/typeorm-query-builder.helper';

export class CrudService<T extends BaseEntity> extends CrudAbstractService<T> {
    private primaryKey: string[];
    private relations: string[];

    constructor(protected repository: Repository<T>) {
        super();

        this.primaryKey = this.repository.metadata.primaryColumns?.map((columnMetadata) => columnMetadata.propertyName) ?? [];
        this.relations = this.repository.metadata.relations?.map((relation) => relation.propertyName);
    }

    get getRepository(): Repository<T> {
        return this.repository;
    }

    async reservedSearch(crudSearchRequest: CrudSearchRequest<T>) {
        const { requestSearchDto, relations } = crudSearchRequest;
        const where =
            Array.isArray(requestSearchDto.where) && requestSearchDto.where.length > 0
                ? requestSearchDto.where.map((queryFilter) => TypeOrmQueryBuilderHelper.queryFilterToFindOptionsWhere(queryFilter))
                : undefined;

        const data = await this.repository.find({
            select: requestSearchDto.select,
            where,
            withDeleted: requestSearchDto.withDeleted,
            take: requestSearchDto.take,
            order: requestSearchDto.order as FindOptionsOrder<T>,
            relations: this.getRelation(relations),
        });

        return { data };
    }

    async reservedReadMany(crudReadManyRequest: CrudReadManyRequest<T>): Promise<PaginationResponse<T>> {
        return crudReadManyRequest.pagination.type === PaginationType.OFFSET
            ? this.paginateOffset(crudReadManyRequest)
            : this.paginateCursor(crudReadManyRequest);
    }

    async reservedReadOne(crudReadOneRequest: CrudReadOneRequest<T>): Promise<CrudResponseType<T>> {
        return this.repository
            .findOne({
                select: crudReadOneRequest.fields as unknown as FindOptionsSelect<T>,
                where: crudReadOneRequest.params as FindOptionsWhere<T>,
                withDeleted: crudReadOneRequest.softDeleted,
                relations: this.getRelation(crudReadOneRequest.relations),
            })
            .then((entity) => {
                if (_.isNil(entity)) {
                    throw new NotFoundException();
                }
                return this.toResponse(entity, crudReadOneRequest.options?.response ?? CRUD_POLICY[Method.READ_ONE].response);
            });
    }

    reservedCreate(req: CrudCreateOneRequest<T>): Promise<CrudResponseType<T>>;
    reservedCreate(req: CrudCreateManyRequest<T>): Promise<Array<CrudResponseType<T>>>;
    async reservedCreate(
        crudCreateRequest: CrudCreateOneRequest<T> | CrudCreateManyRequest<T>,
    ): Promise<CrudResponseType<T> | Array<CrudResponseType<T>>> {
        const responseOption = crudCreateRequest.options?.response;

        const entities = this.repository.create(
            isCrudCreateManyRequest<T>(crudCreateRequest) ? crudCreateRequest.body : [crudCreateRequest.body],
        );

        return this.repository
            .save(entities)
            .then((result) => result.map((r) => this.toResponse(r, responseOption)))
            .then((result) => {
                return isCrudCreateManyRequest<T>(crudCreateRequest) ? result : result[0];
            })
            .catch((error) => {
                throw new ConflictException(error);
            });
    }

    async reservedUpsert(crudUpsertRequest: CrudUpsertRequest<T>): Promise<CrudResponseType<T>> {
        const responseOption = crudUpsertRequest.options?.response;
        return this.repository
            .findOne({
                where: crudUpsertRequest.params as unknown as FindOptionsWhere<T>,
                withDeleted: true,
            })
            .then(async (entity: T | null) => {
                const upsertEntity = entity ?? this.repository.create(crudUpsertRequest.params as unknown as DeepPartial<T>);
                if (!_.isNil(_.get(upsertEntity, 'deletedAt'))) {
                    throw new ConflictException('it has been deleted');
                }

                await this.repository.save(_.merge(upsertEntity, crudUpsertRequest.body));

                return this.toResponse(upsertEntity, responseOption);
            });
    }

    async reservedUpdate(crudUpdateOneRequest: CrudUpdateOneRequest<T>): Promise<CrudResponseType<T>> {
        const responseOption = crudUpdateOneRequest.options?.response;
        const select = responseOption !== CrudResponseOption.ENTITY ? (this.primaryKey as unknown as FindOptionsSelect<T>) : undefined;

        return this.repository
            .findOne({
                where: crudUpdateOneRequest.params as unknown as FindOptionsWhere<T>,
                select,
            })
            .then(async (entity: T | null) => {
                if (!entity) {
                    throw new NotFoundException();
                }

                await this.repository.save(_.merge(entity, crudUpdateOneRequest.body));
                return this.toResponse(entity, responseOption);
            });
    }

    async reservedDelete(crudDeleteOneRequest: CrudDeleteOneRequest<T>): Promise<CrudResponseType<T>> {
        if (this.primaryKey.length === 0) {
            throw new ConflictException('cannot found primary key from entity');
        }
        const responseOption = crudDeleteOneRequest.options?.response;
        const select = responseOption !== CrudResponseOption.ENTITY ? (this.primaryKey as unknown as FindOptionsSelect<T>) : undefined;

        const deleteAction = crudDeleteOneRequest.softDeleted ? 'softDelete' : 'delete';

        return this.repository
            .findOne({
                where: crudDeleteOneRequest.params as unknown as FindOptionsWhere<T>,
                select,
            })
            .then(async (entity: T | null) => {
                if (!entity) {
                    throw new NotFoundException();
                }

                await this.repository[deleteAction](
                    this.primaryKey.reduce((pre, key) => ({ ...pre, [key]: (entity as Record<string, unknown>)[key] }), {}),
                );
                return this.toResponse(entity, responseOption);
            });
    }

    async reservedRecover(crudRecoverRequest: CrudRecoverRequest<T>): Promise<CrudResponseType<T>> {
        const responseOption = crudRecoverRequest.options?.response;
        const select = responseOption !== CrudResponseOption.ENTITY ? (this.primaryKey as unknown as FindOptionsSelect<T>) : undefined;

        return this.repository
            .findOne({
                where: crudRecoverRequest.params as unknown as FindOptionsWhere<T>,
                select,
                withDeleted: true,
            })
            .then(async (entity: T | null) => {
                if (!entity) {
                    throw new NotFoundException();
                }
                await this.repository.recover(entity);
                return this.toResponse(entity, responseOption);
            });
    }

    private async paginateCursor(crudReadManyRequest: CrudReadManyRequest<T>): Promise<PaginationResponse<T>> {
        if (crudReadManyRequest.pagination.type !== PaginationType.CURSOR) {
            throw new TypeError('use only cursor Pagination Type');
        }
        const pagination: PaginationCursorDto = crudReadManyRequest.pagination;
        const limit = crudReadManyRequest.numberOfTake;

        const entities = await this.repository.find({
            where: pagination.token
                ? this.paginateCursorWhereByToken(pagination, crudReadManyRequest.sort)
                : (crudReadManyRequest.query as FindOptionsWhere<T>),
            withDeleted: crudReadManyRequest.softDeleted,
            take: limit,
            order: crudReadManyRequest.primaryKeys.reduce(
                (sort, primaryKey) => ({ ...sort, [primaryKey.name]: crudReadManyRequest.sort }),
                {},
            ),
            relations: this.getRelation(crudReadManyRequest.relations),
        });
        const lastEntity = entities[entities.length - 1];
        const nextCursor = PaginationHelper.serialize(
            _.pick(
                lastEntity,
                crudReadManyRequest.primaryKeys.map(({ name }) => name),
            ),
        );

        return {
            data: entities,
            metadata: { nextCursor, limit, query: pagination.query ?? PaginationHelper.serialize(crudReadManyRequest.query ?? {}) },
        };
    }

    private paginateCursorWhereByToken(pagination: PaginationCursorDto, sort: Sort): FindOptionsWhere<T> {
        const query = PaginationHelper.deserialize(pagination.query);
        const lastObject = PaginationHelper.deserialize(pagination.token);

        const operator = sort === Sort.DESC ? LessThan : MoreThan;
        for (const [key, value] of Object.entries(lastObject)) {
            query[key] = operator(value);
        }
        return query as FindOptionsWhere<T>;
    }

    private async paginateOffset(crudReadManyRequest: CrudReadManyRequest<T>): Promise<PaginationResponse<T>> {
        if (crudReadManyRequest.pagination.type !== PaginationType.OFFSET) {
            throw new TypeError('use only offset Pagination Type');
        }
        const pagination: PaginationOffsetDto = crudReadManyRequest.pagination;
        const findManyOptions = {
            where: crudReadManyRequest.query as FindOptionsWhere<T>,
            take: pagination.limit ?? crudReadManyRequest.numberOfTake,
            withDeleted: crudReadManyRequest.softDeleted,
            order: crudReadManyRequest.primaryKeys.reduce(
                (sort, primaryKey) => ({ ...sort, [primaryKey.name]: crudReadManyRequest.sort }),
                {},
            ),
            relations: this.getRelation(crudReadManyRequest.relations),
        };

        const [entities, total] = await this.repository.findAndCount(
            Number.isFinite(pagination.offset)
                ? {
                      ...findManyOptions,
                      where: PaginationHelper.deserialize(pagination.query) as FindOptionsWhere<T>,
                      skip: pagination.offset,
                  }
                : findManyOptions,
        );
        const offset = (pagination.offset ?? 0) + entities.length;

        return {
            data: entities,
            metadata: {
                page: pagination.offset ? Math.floor(pagination.offset / findManyOptions.take) + 1 : 1,
                pages: total ? Math.ceil(total / findManyOptions.take) : 1,
                total,
                offset,
                query: pagination.query ?? PaginationHelper.serialize(crudReadManyRequest.query ?? {}),
            },
        };
    }

    private toResponse(entity: T, option: CrudResponseOptions | undefined): CrudResponseType<T> {
        if (!option || option === CrudResponseOption.NONE) {
            return;
        }
        if (option === CrudResponseOption.ID) {
            return _.pick(entity, this.primaryKey);
        }
        return entity;
    }

    private getRelation(relations: undefined | string[]): string[] {
        return Array.isArray(relations) ? relations : this.relations;
    }
}
