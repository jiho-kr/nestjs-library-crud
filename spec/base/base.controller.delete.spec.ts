import { HttpStatus } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { BaseEntity } from './base.entity';
import { BaseModule } from './base.module';
import { TestHelper } from '../test.helper';

import type { INestApplication } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';

describe('BaseController', () => {
    let app: INestApplication;

    beforeAll(async () => {
        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [BaseModule, TestHelper.getTypeOrmMysqlModule([BaseEntity])],
        }).compile();
        app = moduleFixture.createNestApplication();

        await app.init();
    });

    beforeEach(async () => {
        await BaseEntity.delete({});
    });

    afterAll(async () => {
        await TestHelper.dropTypeOrmEntityTables();
        await app?.close();
    });

    describe('DELETE', () => {
        it('should be provided /:id', async () => {
            const routerPathList = TestHelper.getRoutePath(app.getHttpServer());
            expect(routerPathList.delete).toEqual(expect.arrayContaining(['/base/:id']));
        });

        it('removes one entity', async () => {
            const name = 'name1';
            const created = await request(app.getHttpServer()).post('/base').send({ name }).expect(HttpStatus.CREATED);
            const id = created.body.id;

            await request(app.getHttpServer()).delete(`/base/${id}`).expect(HttpStatus.OK);

            await request(app.getHttpServer()).get(`/base/${id}`).expect(HttpStatus.NOT_FOUND);

            await request(app.getHttpServer()).delete(`/base/${id}`).expect(HttpStatus.NOT_FOUND);
        });

        it('should be checked params type', async () => {
            await request(app.getHttpServer())
                .delete(`/base/${Number('a')}`)
                .expect(HttpStatus.NOT_FOUND);
        });
    });
});
