import { Router } from 'express';
import { initiateFeePayment } from './student.fee-payment.controller';

const router = Router();

router.post('/invoices/:invoiceId/pay', initiateFeePayment);

export default router;
