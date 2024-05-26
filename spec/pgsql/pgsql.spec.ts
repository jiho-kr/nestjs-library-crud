import { HttpStatus, Controller, Injectable, Module } from '@nestjs/common';
import { ApiHideProperty, ApiProperty } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { Exclude, Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';
import request from 'supertest';
import { Entity, BaseEntity, Column, PrimaryGeneratedColumn, DeleteDateColumn } from 'typeorm';

import { Crud } from '../../src/lib/crud.decorator';
import { CrudService } from '../../src/lib/crud.service';
import { GROUP } from '../../src/lib/interface';
import { TestHelper } from '../test.helper';

import type { CrudController } from '../../src/lib/interface';
import type { INestApplication } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import type { Repository } from 'typeorm';

@Entity('test')
class TestEntity extends BaseEntity {
    @PrimaryGeneratedColumn({ type: 'bigint' })
    @ApiProperty({ description: 'ID' })
    @Type(() => Number)
    @IsNumber({}, { groups: [GROUP.UPDATE, GROUP.READ_ONE, GROUP.PARAMS, GROUP.READ_MANY, GROUP.SEARCH] })
    @IsOptional({ groups: [GROUP.READ_MANY, GROUP.SEARCH, GROUP.UPDATE, GROUP.UPSERT] })
    id: number;

    @Column()
    @ApiProperty({ description: 'name' })
    @IsString({ always: true })
    @IsOptional({ groups: [GROUP.READ_ONE, GROUP.READ_MANY, GROUP.SEARCH, GROUP.UPDATE] })
    @MaxLength(40, { always: true })
    name: string;

    @DeleteDateColumn()
    @ApiHideProperty()
    @Exclude()
    deletedAt?: Date;
}

@Injectable()
class TestService extends CrudService<TestEntity> {
    constructor(@InjectRepository(TestEntity) repository: Repository<TestEntity>) {
        super(repository);
    }
}

@Crud({ entity: TestEntity })
@Controller('base')
class TestController implements CrudController<TestEntity> {
    constructor(public readonly crudService: TestService) {}
}

@Module({
    imports: [TypeOrmModule.forFeature([TestEntity])],
    controllers: [TestController],
    providers: [TestService],
})
class TestModule {}

describe('Search complex conditions', () => {
    let app: INestApplication;

    beforeAll(async () => {
        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [TestModule, TestHelper.getTypeOrmPgsqlModule([TestEntity])],
        }).compile();
        app = moduleFixture.createNestApplication();
        await app.init();
    });

    afterAll(async () => {
        await TestHelper.dropTypeOrmEntityTables();
        await app?.close();
    });

    it('should be completed default operation', async () => {
        const { body: createBody } = await request(app.getHttpServer()).post('/base').send({ name: 'test' }).expect(HttpStatus.CREATED);
        expect(createBody.name).toBe('test');
        expect(createBody.id).toBeDefined();

        const { body: readManyBody } = await request(app.getHttpServer()).get('/base').expect(HttpStatus.OK);
        expect(readManyBody.data).toHaveLength(1);
        expect(readManyBody.data[0]).toEqual({ name: 'test', id: createBody.id, deletedAt: null });

        const { body: readOneBody } = await request(app.getHttpServer()).get(`/base/${createBody.id}`).expect(HttpStatus.OK);
        expect(readOneBody).toEqual({ name: 'test', id: createBody.id, deletedAt: null });

        const { body: updateBody } = await request(app.getHttpServer())
            .patch(`/base/${createBody.id}`)
            .send({ name: 'changed' })
            .expect(HttpStatus.OK);
        expect(updateBody.id).toEqual(createBody.id);
        expect(updateBody.name).toBe('changed');

        const newId = Number(createBody.id) + 1;
        const { body: upsertBody } = await request(app.getHttpServer()).put(`/base/${newId}`).send({ name: 'name2' }).expect(HttpStatus.OK);
        expect(Number(upsertBody.id)).toEqual(newId);
        expect(upsertBody.name).toEqual('name2');

        const { body: deleteBody } = await request(app.getHttpServer()).delete(`/base/${createBody.id}`).expect(HttpStatus.OK);
        expect(deleteBody.id).toEqual(createBody.id);

        const { body: recoveryBody } = await request(app.getHttpServer()).post(`/base/${createBody.id}/recover`).expect(HttpStatus.CREATED);
        expect(recoveryBody.id).toEqual(createBody.id);
    });
});
