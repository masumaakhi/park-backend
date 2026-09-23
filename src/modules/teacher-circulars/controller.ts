import { Request, Response } from 'express';
import { TeacherCircularService } from './service';
import { createCircularSchema, updateCircularSchema } from './schema';

export class TeacherCircularController {
  /**
   * Public: Get currently active circular
   */
  static async getActivePublicCircular(req: Request, res: Response): Promise<void> {
    try {
      const circular = await TeacherCircularService.getActivePublicCircular();
      const circulars = await TeacherCircularService.getActivePublicCirculars();
      res.json({
        success: true,
        data: circular,
        circulars,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to fetch active circular',
      });
    }
  }

  /**
   * Public: List all active circulars
   */
  static async getActivePublicCirculars(req: Request, res: Response): Promise<void> {
    try {
      const circulars = await TeacherCircularService.getActivePublicCirculars();
      res.json({
        success: true,
        data: circulars,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to fetch active circulars',
      });
    }
  }

  /**
   * Admin: List circulars
   */
  static async getCirculars(req: Request, res: Response): Promise<void> {
    try {
      const { status, search } = req.query;
      const circulars = await TeacherCircularService.getCirculars({
        status: status as string,
        search: search as string,
      });
      res.json({
        success: true,
        data: circulars,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to list circulars',
      });
    }
  }

  /**
   * Admin: Get single circular
   */
  static async getCircularById(req: Request, res: Response): Promise<void> {
    try {
      const id = req.params.id as string;
      const circular = await TeacherCircularService.getCircularById(id);
      res.json({
        success: true,
        data: circular,
      });
    } catch (error: any) {
      res.status(404).json({
        success: false,
        message: error.message || 'Circular not found',
      });
    }
  }

  /**
   * Admin: Create circular
   */
  static async createCircular(req: Request, res: Response): Promise<void> {
    try {
      const validated = createCircularSchema.parse(req.body);
      const adminUserId = (req as any).user?.id;
      const circular = await TeacherCircularService.createCircular(validated as any, adminUserId);
      res.status(201).json({
        success: true,
        message: 'Recruitment circular created and published successfully',
        data: circular,
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message || 'Validation failed',
      });
    }
  }

  /**
   * Admin: Update circular
   */
  static async updateCircular(req: Request, res: Response): Promise<void> {
    try {
      const id = req.params.id as string;
      const validated = updateCircularSchema.parse(req.body);
      const adminUserId = (req as any).user?.id;
      const circular = await TeacherCircularService.updateCircular(id, validated as any, adminUserId);
      res.json({
        success: true,
        message: 'Recruitment circular updated successfully',
        data: circular,
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message || 'Update failed',
      });
    }
  }

  /**
   * Admin: Close circular
   */
  static async closeCircular(req: Request, res: Response): Promise<void> {
    try {
      const id = req.params.id as string;
      const circular = await TeacherCircularService.closeCircular(id);
      res.json({
        success: true,
        message: 'Recruitment circular closed',
        data: circular,
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to close circular',
      });
    }
  }

  /**
   * Admin: Publish circular
   */
  static async publishCircular(req: Request, res: Response): Promise<void> {
    try {
      const id = req.params.id as string;
      const circular = await TeacherCircularService.publishCircular(id);
      res.json({
        success: true,
        message: 'Recruitment circular published',
        data: circular,
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to publish circular',
      });
    }
  }
}
