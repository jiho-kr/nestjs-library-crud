import { HttpStatus } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { BaseEntity } from './base.entity';
import { BaseModule } from './base.module';
import { BaseService } from './base.service';
import { TestHelper } from '../test.helper';

import type { INestApplication } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';

describe('BaseController', () => {
    let app: INestApplication;
    let service: BaseService;

    beforeAll(async () => {
        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [BaseModule, TestHelper.getTypeOrmMysqlModule([BaseEntity])],
        }).compile();
        app = moduleFixture.createNestApplication();

        service = moduleFixture.get<BaseService>(BaseService);
        await service.repository.save(['name1', 'name2'].map((name: string) => service.repository.create({ name })));

        await app.init();
    });

    afterAll(async () => {
        await TestHelper.dropTypeOrmEntityTables();
        await app?.close();
    });

    describe('READ_ONE', () => {
        const id = 1;
        it('should be provided /:id', async () => {
            const routerPathList = TestHelper.getRoutePath(app.getHttpServer());
            expect(routerPathList.get).toEqual(expect.arrayContaining(['/base/:id']));
        });

        it('should be returned only one entity', async () => {
            const { body } = await request(app.getHttpServer())
                .get(`/base/${id}`)
                .query({ fields: ['id', 'name', 'createdAt'] })
                .expect(HttpStatus.OK);

            expect(body.id).toEqual(id);
            expect(body.name).toEqual(expect.any(String));
            expect(body.lastModifiedAt).toBeUndefined();
        });

        it('should be fields feature with multiple options', async () => {
            const responseCaseSingleStringParam = await request(app.getHttpServer()).get(`/base/${id}`).query({ fields: 'name' });
            expect(responseCaseSingleStringParam.statusCode).toEqual(HttpStatus.OK);
            expect(responseCaseSingleStringParam.body).toEqual({
                name: expect.any(String),
            });

            const responseCaseIndicesParam = await request(app.getHttpServer()).get(`/base/${id}`).query('fields[0]=name&fields[1]=id');
            expect(responseCaseIndicesParam.statusCode).toEqual(HttpStatus.OK);
            expect(responseCaseIndicesParam.body).toEqual({
                id,
                name: expect.any(String),
            });

            const responseCaseBracketsParam = await request(app.getHttpServer()).get(`/base/${id}`).query('fields[]=name&fields[]=id');
            expect(responseCaseBracketsParam.statusCode).toEqual(HttpStatus.OK);
            expect(responseCaseBracketsParam.body).toEqual({
                id,
                name: expect.any(String),
            });

            const responseCaseRepeatParam = await request(app.getHttpServer()).get(`/base/${id}`).query('fields=name&fields=id');

            expect(responseCaseRepeatParam.statusCode).toEqual(HttpStatus.OK);
            expect(responseCaseRepeatParam.body).toEqual({
                id,
                name: expect.any(String),
            });

            const responseCaseCommaParam = await request(app.getHttpServer()).get(`/base/${id}`).query('fields=name,id');
            expect(responseCaseCommaParam.statusCode).toEqual(HttpStatus.OK);
            expect(responseCaseCommaParam.body).toEqual({
                id,
                name: expect.any(String),
            });
        });

        it('should be use only column names in field options', async () => {
            await request(app.getHttpServer())
                .get(`/base/${id}`)
                .query({ fields: ['id', 'name', 'createdAt'] })
                .expect(HttpStatus.OK);

            await request(app.getHttpServer())
                .get(`/base/${id}`)
                .query({ fields: ['id', 'name', 'createdAt', true] })
                .expect(HttpStatus.UNPROCESSABLE_ENTITY);

            await request(app.getHttpServer())
                .get(`/base/${id}`)
                .query({ fields: ['id', 'name', 'test'] })
                .expect(HttpStatus.UNPROCESSABLE_ENTITY);
        });

        it('should be checked params type', async () => {
            await request(app.getHttpServer())
                .get(`/base/${Number('a')}`)
                .query({ fields: ['id', 'name', 'createdAt'] })
                .expect(HttpStatus.NOT_FOUND);
        });
    });
});
