import { HttpStatus } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { CustomEntity } from './custom-entity.entity';
import { CustomEntityModule } from './custom-entity.module';
import { TestHelper } from '../test.helper';

import type { INestApplication } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';

describe('CustomEntity - Upsert', () => {
    let app: INestApplication;

    beforeAll(async () => {
        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [CustomEntityModule, TestHelper.getTypeOrmMysqlModule([CustomEntity])],
        }).compile();
        app = moduleFixture.createNestApplication();

        await app.init();
    });

    afterAll(async () => {
        await TestHelper.dropTypeOrmEntityTables();
        await app?.close();
    });

    describe('UPSERT', () => {
        it('should be provided /:uuid', async () => {
            const routerPathList = TestHelper.getRoutePath(app.getHttpServer());
            expect(routerPathList.put).toEqual(expect.arrayContaining(['/base/:uuid']));
        });

        it('should update entity if exists', async () => {
            const oldName = 'name1';
            const created = await request(app.getHttpServer()).post('/base').send({ name: oldName }).expect(HttpStatus.CREATED);
            expect(created.body.name).toEqual(oldName);

            const newName = 'name2';
            await request(app.getHttpServer()).put(`/base/${created.body.uuid}`).send({ name: newName }).expect(HttpStatus.OK);
            await request(app.getHttpServer()).put(`/base/${created.body.uuid}`).send({}).expect(HttpStatus.OK);

            const descriptions = 'descriptions';
            await request(app.getHttpServer()).put(`/base/${created.body.uuid}`).send({ descriptions }).expect(HttpStatus.OK);

            const response = await request(app.getHttpServer()).get(`/base/${created.body.uuid}`).expect(HttpStatus.OK);
            expect(response.body.name).toEqual(newName);
            expect(response.body.descriptions).toEqual(descriptions);
        });

        it('should create entity if not exists', async () => {
            const name = 'name1';
            const uuid = '0x1234';

            await request(app.getHttpServer()).get(`/base/${uuid}`).expect(HttpStatus.NOT_FOUND);
            await request(app.getHttpServer()).put(`/base/${uuid}`).send({ name }).expect(HttpStatus.OK);

            const responseWithoutDescription = await request(app.getHttpServer()).get(`/base/${uuid}`).expect(HttpStatus.OK);
            expect(responseWithoutDescription.body.descriptions).toBeNull();

            await request(app.getHttpServer()).put(`/base/${uuid}`).send({}).expect(HttpStatus.OK);
            await request(app.getHttpServer()).put(`/base/${uuid}`).send({ nonamed: 'test' }).expect(HttpStatus.UNPROCESSABLE_ENTITY);

            const descriptions = 'descriptions';
            await request(app.getHttpServer()).put(`/base/${uuid}`).send({ descriptions }).expect(HttpStatus.OK);

            const response = await request(app.getHttpServer()).get(`/base/${uuid}`).expect(HttpStatus.OK);
            expect(response.body.name).toEqual(name);
            expect(response.body.descriptions).toEqual(descriptions);
        });
    });
});
